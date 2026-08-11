import { Prisma } from "@prisma/client";

import { resolveCaptionTone } from "@/lib/caption-tones";
import { toEditorHtml } from "@/lib/content";
import { ensureMinimalStyleProfile } from "@/lib/default-theme";
import {
  generateDraftsForPlan,
  generateDraftsForProviders,
  type ParallelDraftResult,
  type SharedDraftInput,
} from "@/lib/dual-draft";
import { imagesToSlots } from "@/lib/image-slots";
import { uploadMaxImagesPerPost } from "@/lib/integrations";
import { collectLearnedSupplements } from "@/lib/learned-supplement";
import { providerDisplayLabel } from "@/lib/llm-providers";
import { fetchNewsImagesForTopic } from "@/lib/news-images";
import { jobLog } from "@/lib/observability";
import { getUserPlan } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";
import { ensurePostProductFacts } from "@/lib/post-product";
import { findSimilarSources, rankAnchorsByKeyword } from "@/lib/similar-sources";
import {
  normalizeExtendedTraits,
  normalizeTraitsJson,
} from "@/lib/style-traits";
import {
  generateTopicBlogDraft,
  planTopicDraft,
  type TopicImageSlot,
  type TopicPlan,
} from "@/lib/topic-draft";
import { TOPIC_LENGTHS, type TopicLength } from "@/lib/topic-length";
import {
  formatResearchForPrompt,
  researchKeywordBrief,
  researchTopicBrief,
  type TopicResearchBrief,
} from "@/lib/topic-research";
import { ensureProductReviewThemes } from "@/lib/product-review-cache";
import {
  applySceneKeywordMap,
  fillEmptyCaptionsWithKeyword,
  synthesizeSceneKeywords,
} from "@/lib/scene-keyword-fallback";
import { maybeRepairTopicSeo } from "@/lib/seo-score";
import { maybeRepairDraftStyle } from "@/lib/style-score";
import { recordUserUsage } from "@/lib/usage-meter";
import {
  fetchSceneImagesForTopic,
  type StockImageResult,
} from "@/lib/unsplash";
import type { DraftProvider } from "@/lib/llm-providers";

const STALE_MS = 3 * 60 * 1000;

export type GenerateRequest = {
  keyword?: string;
  productHighlights?: string | null;
  captionTone?: string | null;
  length?: TopicLength;
  /** If set, only these providers run (retry path). */
  providers?: DraftProvider[];
  /** Keep other PostDraft rows when regenerating a subset. */
  mergeExistingDrafts?: boolean;
  /** RAG-lite: inject same-product points from learned sources (default on). */
  useLearnedSupplement?: boolean;
  /** Points the user unchecked in the preview UI. */
  excludedSupplementPoints?: string[];
};

export type GenerateTopicRequest = {
  topic: string;
  length?: TopicLength;
  imageCount?: number;
  imageSource?: "unsplash" | "ai";
  replaceImages?: boolean;
  providers?: DraftProvider[];
  mergeExistingDrafts?: boolean;
};

export type JobPublic = {
  id: string;
  postId: string;
  kind: "generate" | "generate_topic";
  status: "pending" | "running" | "completed" | "failed";
  phase: string;
  error: string | null;
  result: GenerationResultPayload | null;
  createdAt: string;
  updatedAt: string;
};

export type GenerationResultPayload = {
  needsSelection?: boolean;
  draftIds?: string[];
  drafts?: Array<{
    id: string;
    provider: string;
    modelId?: string;
    title: string | null;
    titleCandidates?: unknown;
    body: string;
    isSelected: boolean;
    label?: string;
    createdAt?: string;
  }>;
  meta?: Record<string, unknown>;
  productFacts?: unknown;
};

type GenerateContext = {
  keyword: string;
  productHighlights: string | null;
  captionTone: string | null;
  length: TopicLength | string;
  dualEnabled: boolean;
  providers?: DraftProvider[];
  mergeExistingDrafts?: boolean;
  sharedInput: SharedDraftInput;
  slotImages: Array<{
    id: string;
    imageUrl: string;
    caption: string | null;
    orderIndex: number;
    groupId: string | null;
  }>;
  productFacts: unknown;
  draftResults: ParallelDraftResult[];
  styleMeta?: Record<string, unknown>;
};

type TopicDraftResultRow = ParallelDraftResult;

type TopicContext = {
  topic: string;
  length?: TopicLength | string;
  imageCount: number;
  imageSourcePref: "unsplash" | "ai";
  replaceImages: boolean;
  dualEnabled: boolean;
  providers?: DraftProvider[];
  mergeExistingDrafts?: boolean;
  brandName: string;
  styleSummary: string | null;
  traitsForDraft: unknown;
  sampleAnchors: Array<{ excerpt: string }>;
  similarSources: Array<{ title: string | null; excerpt: string }>;
  research: TopicResearchBrief | null;
  plan: TopicPlan | null;
  stockImages: Array<StockImageResult | null>;
  imageErrors: Array<string | null>;
  resolvedSource: "unsplash" | "ai" | "news" | "mixed";
  unsplashRateLimited: boolean;
  slots: TopicImageSlot[];
  createdImages: Array<{
    id: string;
    imageUrl: string;
    caption: string | null;
    orderIndex: number;
    groupId: string | null;
  }>;
  draftResults: TopicDraftResultRow[];
  styleMeta?: Record<string, unknown>;
  seoMeta?: Record<string, unknown>;
};

export { phaseStatusLabel } from "@/lib/post-generate-job-ui";

export function toJobPublic(job: {
  id: string;
  postId: string;
  kind: string;
  status: string;
  phase: string;
  error: string | null;
  resultJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}): JobPublic {
  return {
    id: job.id,
    postId: job.postId,
    kind: job.kind as JobPublic["kind"],
    status: job.status as JobPublic["status"],
    phase: job.phase,
    error: job.error,
    result: (job.resultJson as GenerationResultPayload | null) || null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function asCtx<T>(raw: unknown): T {
  return (raw && typeof raw === "object" ? raw : {}) as T;
}

async function failJob(
  jobId: string,
  message: string,
  opts?: {
    error?: unknown;
    kind?: string;
    phase?: string;
    postId?: string;
    userId?: string;
  },
) {
  jobLog.fail(message, opts?.error ?? new Error(message), {
    jobId,
    kind: opts?.kind,
    phase: opts?.phase,
    postId: opts?.postId,
    userId: opts?.userId,
    status: "failed",
  });
  return prisma.postGenerationJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      error: message.slice(0, 500),
      phase: "failed",
    },
  });
}

async function markStaleIfNeeded(job: {
  id: string;
  status: string;
  updatedAt: Date;
  kind?: string;
  phase?: string;
  postId?: string;
  userId?: string;
}) {
  if (job.status !== "running") return null;
  if (Date.now() - job.updatedAt.getTime() < STALE_MS) return null;
  jobLog.warn("generation job stale timeout", {
    jobId: job.id,
    kind: job.kind,
    phase: job.phase,
    postId: job.postId,
    userId: job.userId,
    status: job.status,
  });
  return failJob(job.id, "생성 작업이 시간 초과로 중단되었습니다. 다시 시도해 주세요.", {
    kind: job.kind,
    phase: job.phase,
    postId: job.postId,
    userId: job.userId,
  });
}

export async function createGenerationJob(input: {
  postId: string;
  userId: string;
  kind: "generate" | "generate_topic";
  request: GenerateRequest | GenerateTopicRequest;
}) {
  const active = await prisma.postGenerationJob.findFirst({
    where: {
      postId: input.postId,
      status: { in: ["pending", "running"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (active) {
    const stale = await markStaleIfNeeded(active);
    if (!stale) {
      return active;
    }
  }

  const initialPhase = input.kind === "generate" ? "assemble" : "research";
  const created = await prisma.postGenerationJob.create({
    data: {
      postId: input.postId,
      userId: input.userId,
      kind: input.kind,
      status: "pending",
      phase: initialPhase,
      requestJson: input.request as object,
      contextJson: {},
    },
  });
  jobLog.phase({
    jobId: created.id,
    postId: created.postId,
    userId: created.userId,
    kind: created.kind,
    phase: created.phase,
    status: created.status,
  });
  return created;
}

export async function getOwnedGenerationJob(jobId: string, userId: string) {
  return prisma.postGenerationJob.findFirst({
    where: { id: jobId, userId },
  });
}

export async function findActiveGenerationJob(postId: string, userId: string) {
  const job = await prisma.postGenerationJob.findFirst({
    where: {
      postId,
      userId,
      status: { in: ["pending", "running"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return null;
  const stale = await markStaleIfNeeded(job);
  if (stale) return null;
  return job;
}

/** Run ticks until terminal state (sync route compatibility). */
export async function runGenerationJobToCompletion(jobId: string, userId: string) {
  let job = await getOwnedGenerationJob(jobId, userId);
  if (!job) throw new Error("생성 작업을 찾을 수 없습니다.");
  while (job.status === "pending" || job.status === "running") {
    job = await tickGenerationJob(jobId, userId);
  }
  return job;
}

export async function tickGenerationJob(jobId: string, userId: string) {
  let job = await getOwnedGenerationJob(jobId, userId);
  if (!job) throw new Error("생성 작업을 찾을 수 없습니다.");

  const stale = await markStaleIfNeeded(job);
  if (stale) return stale;

  if (job.status === "completed" || job.status === "failed") return job;

  job = await prisma.postGenerationJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  jobLog.phase({
    jobId: job.id,
    postId: job.postId,
    userId: job.userId,
    kind: job.kind,
    phase: job.phase,
    status: "running",
  });

  try {
    if (job.kind === "generate") {
      return await tickGenerate(job);
    }
    return await tickGenerateTopic(job);
  } catch (e) {
    const message = e instanceof Error ? e.message : "생성에 실패했습니다.";
    return failJob(jobId, message, {
      error: e,
      kind: job.kind,
      phase: job.phase,
      postId: job.postId,
      userId: job.userId,
    });
  }
}

async function tickGenerate(job: {
  id: string;
  postId: string;
  userId: string;
  phase: string;
  requestJson: unknown;
  contextJson: unknown;
}) {
  const req = asCtx<GenerateRequest>(job.requestJson);
  const ctx = asCtx<GenerateContext>(job.contextJson);

  if (job.phase === "assemble" || job.phase === "pending") {
    const assembled = await assembleGenerateContext(job.postId, job.userId, req);
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        phase: "draft",
        contextJson: assembled as object,
      },
    });
  }

  // Legacy sequential phases + new parallel `draft`
  if (
    job.phase === "draft" ||
    job.phase === "draft_gpt" ||
    job.phase === "draft_gemini"
  ) {
    const draftResults = await runGenerateDraftPhase(ctx);
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        phase: "style_repair",
        contextJson: { ...ctx, draftResults } as object,
      },
    });
  }

  if (job.phase === "style_repair") {
    const repaired = await repairGenerateDrafts(ctx);
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        phase: "persist",
        contextJson: repaired as object,
      },
    });
  }

  if (job.phase === "persist") {
    const payload = await persistGenerate(job.postId, job.userId, ctx);
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        phase: "completed",
        resultJson: payload as object,
        error: null,
      },
    });
  }

  return failJob(job.id, `알 수 없는 단계: ${job.phase}`);
}

async function runGenerateDraftPhase(
  ctx: GenerateContext,
): Promise<ParallelDraftResult[]> {
  if (ctx.providers?.length) {
    return generateDraftsForProviders(ctx.sharedInput, ctx.providers);
  }
  return generateDraftsForPlan(ctx.sharedInput, ctx.dualEnabled);
}

async function repairGenerateDrafts(ctx: GenerateContext): Promise<GenerateContext> {
  const draftResults: ParallelDraftResult[] = [];
  const styleMeta: Record<string, unknown> = {};
  for (const d of ctx.draftResults || []) {
    if (d.error || !d.body.trim()) {
      draftResults.push(d);
      continue;
    }
    const out = await maybeRepairDraftStyle({
      html: d.body,
      title: d.title,
      traitsJson: ctx.sharedInput.traitsJson,
      draftProvider: d.provider as DraftProvider,
    });
    styleMeta[d.provider] = {
      score: out.score.score,
      repaired: out.repaired,
      issues: out.score.issues,
    };
    draftResults.push({
      ...d,
      body: out.body,
      tokenUsage: out.tokenUsage
        ? {
            input: (d.tokenUsage?.input || 0) + (out.tokenUsage.input || 0),
            output: (d.tokenUsage?.output || 0) + (out.tokenUsage.output || 0),
          }
        : d.tokenUsage,
    });
  }
  return { ...ctx, draftResults, styleMeta };
}

async function assembleGenerateContext(
  postId: string,
  userId: string,
  req: GenerateRequest,
): Promise<GenerateContext> {
  const post = await prisma.post.findFirst({
    where: { id: postId, brand: { userId } },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true } },
    },
  });
  if (!post) throw new Error("포스트를 찾을 수 없습니다.");

  const keyword = req.keyword?.trim() || post.keyword?.trim();
  if (!keyword) throw new Error("키워드가 필요합니다.");

  const productHighlights =
    req.productHighlights !== undefined
      ? req.productHighlights?.trim() || null
      : post.productHighlights;
  const captionTone =
    req.captionTone !== undefined ? req.captionTone?.trim() || null : post.captionTone;
  const length =
    req.length && (TOPIC_LENGTHS as readonly string[]).includes(req.length)
      ? req.length
      : "medium";

  const factsDirty =
    keyword !== post.keyword || productHighlights !== post.productHighlights;
  if (factsDirty || captionTone !== post.captionTone) {
    await prisma.post.update({
      where: { id: postId },
      data: {
        keyword,
        productHighlights,
        captionTone,
        ...(factsDirty ? { productFactsJson: Prisma.DbNull } : {}),
      },
    });
  }

  await ensureMinimalStyleProfile(post.brandId);
  const styleProfile = await prisma.styleProfile.findUnique({
    where: { brandId: post.brandId },
  });
  if (!styleProfile) throw new Error("스타일 프로필을 준비하지 못했습니다.");

  const brandTone = normalizeTraitsJson(styleProfile.traitsJson).tone;
  const voiceTone = resolveCaptionTone(captionTone, brandTone);
  const sampleAnchorsRaw = Array.isArray(styleProfile.sampleAnchors)
    ? (styleProfile.sampleAnchors as Array<{ excerpt?: string }>).filter(
        (a): a is { excerpt: string } => typeof a?.excerpt === "string",
      )
    : [];
  const sampleAnchors = rankAnchorsByKeyword(sampleAnchorsRaw, keyword, 4);

  const productFacts = await ensurePostProductFacts({
    id: post.id,
    keyword,
    productHighlights,
    productFactsJson: factsDirty ? null : post.productFactsJson,
  });

  const emptyCaptionIds = post.images.filter((img) => !img.caption?.trim()).map((img) => img.id);
  if (emptyCaptionIds.length) {
    let fillMap: Record<string, string> = {};
    try {
      const themes = await ensureProductReviewThemes({
        brandId: post.brandId,
        productName: productFacts.productName || keyword,
      });
      if (themes.length) {
        fillMap = synthesizeSceneKeywords(
          post.images.map((img) => ({ id: img.id, caption: img.caption })),
          themes,
        );
      }
    } catch (e) {
      jobLog.warn("review themes failed", {
        postId,
        phase: "assemble",
        error: e instanceof Error ? e.message : String(e),
      });
    }
    const stillEmpty = post.images.filter(
      (img) => !img.caption?.trim() && !fillMap[img.id],
    );
    if (stillEmpty.length) {
      fillMap = {
        ...fillMap,
        ...fillEmptyCaptionsWithKeyword(stillEmpty, keyword, {
          productName: productFacts.productName,
        }),
      };
    }
    const withCaptions = applySceneKeywordMap(
      post.images.map((img) => ({ id: img.id, caption: img.caption })),
      fillMap,
    );
    for (const img of withCaptions) {
      if (!fillMap[img.id]) continue;
      await prisma.postImage.update({
        where: { id: img.id },
        data: { caption: img.caption },
      });
      const row = post.images.find((r) => r.id === img.id);
      if (row) row.caption = img.caption || row.caption;
    }
  }

  const images = post.images.map((img) => ({
    imageUrl: img.imageUrl,
    caption: img.caption,
  }));
  const slotImages = post.images.map((img) => ({
    id: img.id,
    imageUrl: img.imageUrl,
    caption: img.caption,
    orderIndex: img.orderIndex,
    groupId: img.groupId,
  }));
  const imageSlots = imagesToSlots(slotImages).map((slot) =>
    slot.kind === "single"
      ? {
          type: "single" as const,
          images: [{ imageUrl: slot.image.imageUrl, caption: slot.image.caption }],
        }
      : {
          type: "group" as const,
          images: slot.images.map((img) => ({
            imageUrl: img.imageUrl,
            caption: img.caption,
          })),
        },
  );

  const sceneKeywordBlob = images
    .map((img) => img.caption?.trim())
    .filter(Boolean)
    .join("\n");
  const sourceCorpus = await prisma.sourcePost.findMany({
    where: { brandId: post.brandId },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      rawText: true,
      publishedAt: true,
      createdAt: true,
    },
  });
  const similarTopK = images.length === 0 ? 5 : 3;
  const similarSources = findSimilarSources(
    `${keyword}\n${productFacts.productName}\n${productFacts.highlights.join(" ")}\n${sceneKeywordBlob}`,
    sourceCorpus,
    similarTopK,
  ).map((s) => ({ title: s.title, excerpt: s.excerpt }));

  let webResearch: string | null = null;
  if (images.length === 0 && keyword.trim()) {
    try {
      const brief = await researchKeywordBrief(keyword);
      if (brief.facts.length || brief.sources.length) {
        webResearch = formatResearchForPrompt(brief);
      }
    } catch (e) {
      jobLog.warn("keyword research failed", {
        postId,
        phase: "assemble",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const postMode =
    post.mode === "product" || post.mode === "worklog" ? post.mode : "worklog";

  let learnedSupplements: SharedDraftInput["learnedSupplements"] = null;
  const useLearned =
    req.useLearnedSupplement !== false &&
    (postMode === "worklog" || postMode === "product") &&
    images.length > 0;
  if (useLearned) {
    try {
      const excluded = new Set(
        (req.excludedSupplementPoints || [])
          .map((p) => p.trim())
          .filter(Boolean),
      );
      const points = await collectLearnedSupplements({
        sources: sourceCorpus,
        keyword,
        notes: productHighlights,
        imagePrompts: images.map((img) => img.caption || ""),
        productName: productFacts.productName,
        enabled: true,
      });
      learnedSupplements = points
        .filter((p) => !excluded.has(p.point))
        .map((p) => ({ point: p.point, kind: p.kind }));
      if (learnedSupplements.length) {
        jobLog.phase({
          postId,
          phase: "assemble",
          learnedSupplementCount: learnedSupplements.length,
        });
      }
    } catch (e) {
      jobLog.warn("learned supplement failed", {
        postId,
        phase: "assemble",
        error: e instanceof Error ? e.message : String(e),
      });
      learnedSupplements = null;
    }
  }

  const { limits, unlimited } = await getUserPlan(userId);
  const dualEnabled = unlimited || limits.dualGenerationEnabled;

  const sharedInput: SharedDraftInput = {
    brandName: post.brand.name,
    keyword,
    styleSummary: styleProfile.summaryText,
    traitsJson: styleProfile.traitsJson,
    sampleAnchors,
    images,
    imageSlots,
    similarSources,
    productFacts,
    voiceTone,
    length,
    postMode,
    webResearch,
    learnedSupplements,
  };

  return {
    keyword,
    productHighlights,
    captionTone,
    length,
    dualEnabled,
    providers: req.providers,
    mergeExistingDrafts: req.mergeExistingDrafts,
    sharedInput,
    slotImages,
    productFacts,
    draftResults: [],
  };
}

type SavedDraftRow = {
  id: string;
  provider: string;
  modelId?: string;
  title: string | null;
  titleCandidates: unknown;
  body: string;
  isSelected: boolean;
  createdAt: string;
};

async function persistGenerate(
  postId: string,
  userId: string,
  ctx: GenerateContext,
): Promise<GenerationResultPayload> {
  const parallel = ctx.draftResults || [];
  const successes = parallel.filter((d) => !d.error && d.body.trim());
  if (!successes.length) {
    throw new Error(
      ctx.dualEnabled || (ctx.providers?.length || 0) > 1
        ? "초안 생성에 실패했습니다. 아래에서 다시 시도해 주세요."
        : "초안 생성에 실패했습니다. 아래에서 다시 시도해 주세요.",
    );
  }

  const tokenIn = successes.reduce((s, d) => s + (d.tokenUsage?.input || 0), 0);
  const tokenOut = successes.reduce((s, d) => s + (d.tokenUsage?.output || 0), 0);
  await recordUserUsage(userId, {
    generates: 1,
    llmInputTokens: tokenIn,
    llmOutputTokens: tokenOut,
  }).catch(() => undefined);

  const images = ctx.sharedInput.images;
  const merge = Boolean(ctx.mergeExistingDrafts);
  if (merge) {
    const providers = successes.map((d) => d.provider);
    await prisma.postDraft.deleteMany({
      where: { postId, provider: { in: providers } },
    });
  } else {
    await prisma.postDraft.deleteMany({ where: { postId } });
  }

  for (const d of successes) {
    const bodyHtml = toEditorHtml(d.body, images, ctx.slotImages);
    await prisma.postDraft.create({
      data: {
        postId,
        provider: d.provider,
        modelId: d.modelId,
        title: d.title,
        titleCandidates: d.titleCandidates,
        body: bodyHtml,
        tokenUsage: d.tokenUsage ?? undefined,
        isSelected: false,
      },
    });
  }

  const allRows = await prisma.postDraft.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
  });
  const savedDrafts: SavedDraftRow[] = allRows.map((row) => ({
    id: row.id,
    provider: row.provider,
    modelId: row.modelId || undefined,
    title: row.title,
    titleCandidates: row.titleCandidates,
    body: row.body,
    isSelected: false,
    createdAt: row.createdAt.toISOString(),
  }));

  const needsSelection = savedDrafts.length >= 2;
  const failedFromRun = parallel
    .filter((d) => d.error)
    .map((d) => ({ provider: d.provider, error: d.error || "실패" }));
  const meta = {
    dual: ctx.dualEnabled,
    succeeded: successes.map((s) => s.provider),
    failed: failedFromRun,
    style: ctx.styleMeta || null,
  };

  if (!needsSelection) {
    const only = savedDrafts[0];
    await prisma.postDraft.update({
      where: { id: only.id },
      data: { isSelected: true },
    });
    await prisma.post.update({
      where: { id: postId },
      data: {
        keyword: ctx.keyword,
        productHighlights: ctx.productHighlights,
        captionTone: ctx.captionTone,
        title: only.title,
        titleCandidates: only.titleCandidates ?? undefined,
        body: only.body,
        status: "draft",
      },
    });
    return {
      needsSelection: false,
      draftIds: [only.id],
      drafts: [{ ...only, isSelected: true, label: providerDisplayLabel(0) }],
      productFacts: ctx.productFacts,
      meta,
    };
  }

  await prisma.postDraft.updateMany({
    where: { postId },
    data: { isSelected: false },
  });
  await prisma.post.update({
    where: { id: postId },
    data: {
      keyword: ctx.keyword,
      productHighlights: ctx.productHighlights,
      captionTone: ctx.captionTone,
      status: "draft",
      title: null,
      body: null,
    },
  });

  return {
    needsSelection: true,
    draftIds: savedDrafts.map((d) => d.id),
    drafts: savedDrafts.map((d, i) => ({
      ...d,
      label: providerDisplayLabel(i),
    })),
    productFacts: ctx.productFacts,
    meta,
  };
}

async function tickGenerateTopic(job: {
  id: string;
  postId: string;
  userId: string;
  phase: string;
  requestJson: unknown;
  contextJson: unknown;
}) {
  const req = asCtx<GenerateTopicRequest>(job.requestJson);
  const ctx = asCtx<TopicContext>(job.contextJson);

  if (job.phase === "research" || job.phase === "pending") {
    const next = await phaseTopicResearch(job.postId, job.userId, req);
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        phase: "plan",
        contextJson: next as object,
      },
    });
  }

  if (job.phase === "plan") {
    const plan = await planTopicDraft({
      topic: ctx.topic,
      brandName: ctx.brandName,
      imageCount: ctx.imageCount,
      length: ctx.length,
      styleSummary: ctx.styleSummary,
      traitsJson: ctx.traitsForDraft,
      research: ctx.research,
      sampleAnchors: ctx.sampleAnchors,
      similarSources: ctx.similarSources,
    });
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        phase: "images",
        contextJson: { ...ctx, plan } as object,
      },
    });
  }

  if (job.phase === "images") {
    const withImages = await phaseTopicImages(job.postId, ctx);
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        phase: "draft",
        contextJson: { ...withImages, draftResults: [] } as object,
      },
    });
  }

  if (
    job.phase === "draft" ||
    job.phase === "draft_gpt" ||
    job.phase === "draft_gemini"
  ) {
    const draftResults = await runTopicDraftPhase(ctx);
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        phase: "style_repair",
        contextJson: { ...ctx, draftResults } as object,
      },
    });
  }

  if (job.phase === "style_repair") {
    const repaired = await repairTopicDrafts(ctx);
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        phase: "persist",
        contextJson: repaired as object,
      },
    });
  }

  if (job.phase === "persist") {
    const payload = await persistTopic(job.postId, job.userId, ctx);
    return prisma.postGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        phase: "completed",
        resultJson: payload as object,
        error: null,
      },
    });
  }

  return failJob(job.id, `알 수 없는 단계: ${job.phase}`);
}

async function runTopicDraftPhase(
  ctx: TopicContext,
): Promise<TopicDraftResultRow[]> {
  const providers: DraftProvider[] = ctx.providers?.length
    ? ctx.providers
    : ctx.dualEnabled
      ? ["gpt", "gemini"]
      : ["gpt"];
  if (providers.length === 1) {
    return [await runTopicDraftProvider(ctx, providers[0])];
  }
  return Promise.all(providers.map((p) => runTopicDraftProvider(ctx, p)));
}

async function runTopicDraftProvider(
  ctx: TopicContext,
  provider: DraftProvider,
): Promise<TopicDraftResultRow> {
  if (!ctx.plan) throw new Error("기획 결과가 없습니다.");
  try {
    const draft = await generateTopicBlogDraft({
      topic: ctx.topic,
      brandName: ctx.brandName,
      plan: ctx.plan,
      slots: ctx.slots || [],
      length: ctx.length,
      styleSummary: ctx.styleSummary,
      traitsJson: ctx.traitsForDraft,
      research: ctx.research,
      sampleAnchors: ctx.sampleAnchors,
      similarSources: ctx.similarSources,
      draftProvider: provider,
    });
    const imageInputs = (ctx.createdImages || []).map((img) => ({
      imageUrl: img.imageUrl,
      caption: img.caption,
    }));
    const bodyHtml = toEditorHtml(draft.body, imageInputs, ctx.createdImages || []);
    return {
      provider,
      modelId: draft.meta.modelId || provider,
      title: draft.title,
      titleCandidates: draft.titleCandidates,
      body: bodyHtml,
      usedFallback: draft.meta.usedFallback,
      tokenUsage: draft.meta.tokenUsage,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : `${provider} 초안 생성 실패`;
    return {
      provider,
      modelId: provider,
      title: "",
      titleCandidates: [],
      body: "",
      usedFallback: false,
      error: message,
    };
  }
}

async function repairTopicDrafts(ctx: TopicContext): Promise<TopicContext> {
  const draftResults: TopicDraftResultRow[] = [];
  const styleMeta: Record<string, unknown> = {};
  const seoMeta: Record<string, unknown> = {};
  for (const d of ctx.draftResults || []) {
    if (d.error || !d.body.trim()) {
      draftResults.push(d);
      continue;
    }
    const out = await maybeRepairDraftStyle({
      html: d.body,
      title: d.title,
      traitsJson: ctx.traitsForDraft,
      draftProvider: d.provider as DraftProvider,
    });
    styleMeta[d.provider] = {
      score: out.score.score,
      repaired: out.repaired,
      issues: out.score.issues,
    };
    const seo = await maybeRepairTopicSeo({
      html: out.body,
      title: d.title,
      topic: ctx.topic,
      length: ctx.length,
      plan: ctx.plan,
      research: ctx.research,
      imageCount: (ctx.createdImages || []).length,
      draftProvider: d.provider as DraftProvider,
    });
    seoMeta[d.provider] = {
      score: seo.score.score,
      repaired: seo.repaired,
      issues: seo.score.issues,
      /** Heuristic checklist only — not a search ranking prediction. */
      heuristic: true,
    };
    const tokenIn =
      (d.tokenUsage?.input || 0) +
      (out.tokenUsage?.input || 0) +
      (seo.tokenUsage?.input || 0);
    const tokenOut =
      (d.tokenUsage?.output || 0) +
      (out.tokenUsage?.output || 0) +
      (seo.tokenUsage?.output || 0);
    draftResults.push({
      ...d,
      body: seo.body,
      tokenUsage: { input: tokenIn, output: tokenOut },
    });
  }
  return { ...ctx, draftResults, styleMeta, seoMeta };
}

async function phaseTopicResearch(
  postId: string,
  userId: string,
  req: GenerateTopicRequest,
): Promise<TopicContext> {
  const post = await prisma.post.findFirst({
    where: { id: postId, brand: { userId } },
    include: { brand: { select: { id: true, name: true } } },
  });
  if (!post) throw new Error("포스트를 찾을 수 없습니다.");

  const topic = req.topic?.trim();
  if (!topic || topic.length < 2) throw new Error("주제를 2자 이상 입력해 주세요.");

  const { limits, unlimited } = await getUserPlan(userId);
  const dualEnabled = unlimited || limits.dualGenerationEnabled;
  const maxImages = Math.min(limits.imagesPerPost, uploadMaxImagesPerPost(), 6);
  const imageCount = Math.min(req.imageCount ?? 3, maxImages);
  const imageSourcePref = req.imageSource === "ai" ? "ai" : "unsplash";
  const replaceImages = req.replaceImages !== false;
  const length =
    req.length && (TOPIC_LENGTHS as readonly string[]).includes(req.length)
      ? req.length
      : undefined;

  await ensureMinimalStyleProfile(post.brandId);
  const styleProfile = await prisma.styleProfile.findUnique({
    where: { brandId: post.brandId },
  });
  const brandTone = normalizeTraitsJson(styleProfile?.traitsJson).tone;
  const voiceTone = resolveCaptionTone(post.captionTone, brandTone);
  const traitsForDraft = {
    ...normalizeExtendedTraits(styleProfile?.traitsJson),
    tone: voiceTone,
  };

  let research: TopicResearchBrief | null = null;
  try {
    research = await researchTopicBrief(topic);
  } catch (e) {
    jobLog.warn("topic research failed", {
      phase: "research",
      topic,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const sampleAnchorsRaw = Array.isArray(styleProfile?.sampleAnchors)
    ? (styleProfile!.sampleAnchors as Array<{ excerpt?: string }>).filter(
        (a): a is { excerpt: string } => typeof a?.excerpt === "string",
      )
    : [];
  const sampleAnchors = rankAnchorsByKeyword(sampleAnchorsRaw, topic, 4);
  const sourceCorpus = await prisma.sourcePost.findMany({
    where: { brandId: post.brandId },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      rawText: true,
      publishedAt: true,
      createdAt: true,
    },
  });
  const similarSources = findSimilarSources(topic, sourceCorpus, 3).map((s) => ({
    title: s.title,
    excerpt: s.excerpt,
  }));

  return {
    topic,
    length,
    imageCount,
    imageSourcePref,
    replaceImages,
    dualEnabled,
    providers: req.providers,
    mergeExistingDrafts: req.mergeExistingDrafts,
    brandName: post.brand.name,
    styleSummary: styleProfile?.summaryText || null,
    traitsForDraft,
    sampleAnchors,
    similarSources,
    research,
    plan: null,
    stockImages: [],
    imageErrors: [],
    resolvedSource: imageSourcePref,
    unsplashRateLimited: false,
    slots: [],
    createdImages: [],
    draftResults: [],
  };
}

async function ensureNewsSearchHits(
  topic: string,
  research: TopicResearchBrief | null,
): Promise<TopicResearchBrief | null> {
  if (research && (research.hits.length > 0 || research.sources.length > 0)) {
    return research;
  }
  try {
    const { collectSearchHits } = await import("@/lib/product-facts");
    const hits = await collectSearchHits(`${topic} 뉴스`, 8, { includeImages: true });
    if (!hits.length) return research;
    return {
      topic,
      facts: [],
      angles: [],
      caveats: [],
      sources: hits.slice(0, 6).map((h) => ({
        title: h.title,
        url: h.url,
        note: h.content.slice(0, 160) || undefined,
      })),
      hits,
      isNewsTopic: true,
      fetchedAt: new Date().toISOString(),
      usedFallback: true,
    };
  } catch {
    return research;
  }
}

async function phaseTopicImages(postId: string, ctx: TopicContext): Promise<TopicContext> {
  if (!ctx.plan) throw new Error("기획 결과가 없습니다.");
  const plan = ctx.plan;
  const targetCount = Math.max(plan.sections.length, ctx.imageCount);
  let stockImages: Array<StockImageResult | null> = new Array(targetCount).fill(null);
  let imageErrors: Array<string | null> = new Array(targetCount).fill(null);
  let resolvedSource: TopicContext["resolvedSource"] = ctx.imageSourcePref;
  let unsplashRateLimited = false;
  let research = ctx.research;

  if (ctx.imageSourcePref === "ai") {
    const queries = Array.from({ length: targetCount }, (_, i) => {
      const section = plan.sections[i % plan.sections.length];
      return section.imagePrompt;
    });
    const stock = await fetchSceneImagesForTopic({
      queries,
      folder: `posts/${postId}`,
      imageSource: "ai",
    });
    stockImages = stock.results;
    imageErrors = stock.errors;
    resolvedSource = "ai";
  } else {
    const queries = Array.from({ length: targetCount }, (_, i) => {
      const section = plan.sections[i % plan.sections.length];
      return `${section.sceneKeyword || section.heading} ${ctx.topic}`.slice(0, 100);
    });
    const stock = await fetchSceneImagesForTopic({
      queries,
      folder: `posts/${postId}`,
      imageSource: "unsplash",
    });
    stockImages = stock.results;
    imageErrors = stock.errors;
    unsplashRateLimited = stock.rateLimited;
    resolvedSource = "unsplash";
  }

  const filled = stockImages.filter(Boolean).length;
  const needNews =
    ctx.imageSourcePref !== "ai" && (unsplashRateLimited || filled < targetCount);

  if (needNews) {
    research = await ensureNewsSearchHits(ctx.topic, research);
  }

  if (needNews && research) {
    const news = await fetchNewsImagesForTopic({
      sources: research.sources,
      hits: research.hits,
      count: targetCount,
      folder: `posts/${postId}`,
      topic: ctx.topic,
    });

    if (news.usedNews) {
      for (let i = 0; i < targetCount; i++) {
        if (!stockImages[i] && news.results[i]) {
          stockImages[i] = news.results[i];
          imageErrors[i] = null;
        }
      }
      const newsPool = news.results.filter(Boolean) as StockImageResult[];
      let ni = 0;
      for (let i = 0; i < targetCount; i++) {
        if (stockImages[i]) continue;
        while (
          ni < newsPool.length &&
          stockImages.some((s) => s?.imageUrl === newsPool[ni]?.imageUrl)
        ) {
          ni += 1;
        }
        if (ni >= newsPool.length) break;
        stockImages[i] = newsPool[ni];
        imageErrors[i] = null;
        ni += 1;
      }
      const hasUnsplash = stockImages.some((s) => s?.sourceMeta.provider === "unsplash");
      const hasNews = stockImages.some((s) => s?.sourceMeta.provider === "news");
      if (hasNews && hasUnsplash) resolvedSource = "mixed";
      else if (hasNews) resolvedSource = "news";
    }
  }

  if (!stockImages.filter(Boolean).length) {
    const firstErr =
      imageErrors.find(Boolean) ||
      (unsplashRateLimited
        ? "Unsplash 한도 초과 후 관련 뉴스 이미지도 찾지 못했습니다."
        : "이미지를 가져오지 못했습니다.");
    throw new Error(`이미지 준비 실패: ${firstErr}`);
  }

  if (ctx.replaceImages) {
    await prisma.postImage.deleteMany({ where: { postId } });
  }

  const startOrder = ctx.replaceImages
    ? 0
    : (
        await prisma.postImage.aggregate({
          where: { postId },
          _max: { orderIndex: true },
        })
      )._max.orderIndex ?? -1;

  const slots: TopicImageSlot[] = [];
  const createdImages: TopicContext["createdImages"] = [];
  let order = ctx.replaceImages ? 0 : startOrder + 1;

  for (let i = 0; i < targetCount; i++) {
    const section = plan.sections[Math.min(i, plan.sections.length - 1)];
    const stock = stockImages[i];
    const caption =
      stock?.caption ||
      `${resolvedSource === "ai" ? "AI 생성" : "참고 이미지"} · ${section.sceneKeyword}`.slice(
        0,
        200,
      );

    if (stock?.imageUrl) {
      const image = await prisma.postImage.create({
        data: {
          postId,
          imageUrl: stock.imageUrl,
          caption,
          orderIndex: order,
          sourceMeta: stock.sourceMeta,
        },
      });
      createdImages.push({
        id: image.id,
        imageUrl: image.imageUrl,
        caption: image.caption,
        orderIndex: image.orderIndex,
        groupId: image.groupId,
      });
      slots.push({
        imageUrl: image.imageUrl,
        caption,
        heading:
          i < plan.sections.length ? section.heading : `${section.heading} (추가 사진)`,
        bulletPoints: section.bulletPoints,
      });
      order += 1;
    } else if (i < plan.sections.length) {
      slots.push({
        imageUrl: "",
        caption,
        heading: section.heading,
        bulletPoints: section.bulletPoints,
      });
    }
  }

  return {
    ...ctx,
    research,
    stockImages,
    imageErrors,
    resolvedSource,
    unsplashRateLimited,
    slots,
    createdImages,
  };
}

async function persistTopic(
  postId: string,
  userId: string,
  ctx: TopicContext,
): Promise<GenerationResultPayload> {
  if (!ctx.plan) throw new Error("기획 결과가 없습니다.");

  const parallel = ctx.draftResults || [];
  const successes = parallel.filter((d) => !d.error && d.body.trim());
  if (!successes.length) {
    throw new Error("초안 생성에 실패했습니다. 아래에서 다시 시도해 주세요.");
  }

  const tokenIn = successes.reduce((s, d) => s + (d.tokenUsage?.input || 0), 0);
  const tokenOut = successes.reduce((s, d) => s + (d.tokenUsage?.output || 0), 0);
  await recordUserUsage(userId, {
    generates: 1,
    llmInputTokens: tokenIn,
    llmOutputTokens: tokenOut,
  }).catch(() => undefined);

  const merge = Boolean(ctx.mergeExistingDrafts);
  if (merge) {
    await prisma.postDraft.deleteMany({
      where: { postId, provider: { in: successes.map((d) => d.provider) } },
    });
  } else {
    await prisma.postDraft.deleteMany({ where: { postId } });
  }

  for (const d of successes) {
    await prisma.postDraft.create({
      data: {
        postId,
        provider: d.provider,
        modelId: d.modelId,
        title: d.title,
        titleCandidates: d.titleCandidates,
        body: d.body,
        tokenUsage: d.tokenUsage ?? undefined,
        isSelected: false,
      },
    });
  }

  const allRows = await prisma.postDraft.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
  });
  const savedDrafts: SavedDraftRow[] = allRows.map((row) => ({
    id: row.id,
    provider: row.provider,
    modelId: row.modelId || undefined,
    title: row.title,
    titleCandidates: row.titleCandidates,
    body: row.body,
    isSelected: false,
    createdAt: row.createdAt.toISOString(),
  }));

  const needsSelection = savedDrafts.length >= 2;
  const baseMeta = {
    dual: ctx.dualEnabled,
    succeeded: successes.map((s) => s.provider),
    failed: parallel
      .filter((d) => d.error)
      .map((d) => ({ provider: d.provider, error: d.error || "실패" })),
    style: ctx.styleMeta || null,
    seo: ctx.seoMeta || null,
    topicPlan: {
      title: ctx.plan.title,
      sectionCount: ctx.plan.sections.length,
      disclaimer: ctx.plan.disclaimer,
    },
    research: ctx.research
      ? {
          isNewsTopic: ctx.research.isNewsTopic,
          factCount: ctx.research.facts.length,
          sourceCount: ctx.research.sources.length,
        }
      : null,
    images: {
      source: ctx.resolvedSource,
      unsplashRateLimited: ctx.unsplashRateLimited,
      requested: ctx.imageCount,
      created: (ctx.createdImages || []).length,
      usedFallback: (ctx.stockImages || []).some((g) => g?.usedFallback),
      errors: (ctx.imageErrors || []).filter(Boolean),
    },
  };

  if (!needsSelection) {
    const only = savedDrafts[0];
    await prisma.postDraft.update({
      where: { id: only.id },
      data: { isSelected: true },
    });
    await prisma.post.update({
      where: { id: postId },
      data: {
        mode: "topic",
        keyword: ctx.topic.slice(0, 120),
        title: only.title,
        titleCandidates: only.titleCandidates ?? undefined,
        body: only.body,
        status: "draft",
      },
    });
    return {
      needsSelection: false,
      draftIds: [only.id],
      drafts: [{ ...only, isSelected: true, label: providerDisplayLabel(0) }],
      meta: baseMeta,
    };
  }

  await prisma.post.update({
    where: { id: postId },
    data: {
      mode: "topic",
      keyword: ctx.topic.slice(0, 120),
      status: "draft",
      title: null,
      body: null,
    },
  });

  return {
    needsSelection: true,
    draftIds: savedDrafts.map((d) => d.id),
    drafts: savedDrafts.map((d, i) => ({
      ...d,
      label: providerDisplayLabel(i),
    })),
    meta: baseMeta,
  };
}

/** Load post payload for completed generate jobs (UI hydrate). */
export async function loadPostForJobResult(postId: string, userId: string) {
  return prisma.post.findFirst({
    where: { id: postId, brand: { userId } },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true } },
      drafts: { orderBy: { createdAt: "asc" } },
    },
  });
}
