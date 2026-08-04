import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { toEditorHtml } from "@/lib/content";
import { ensureMinimalStyleProfile } from "@/lib/default-theme";
import { generateDraftsInParallel } from "@/lib/dual-draft";
import { imagesToSlots } from "@/lib/image-slots";
import { resolveCaptionTone } from "@/lib/caption-tones";
import { providerDisplayLabel } from "@/lib/llm-providers";
import { assertCanGenerate } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";
import { ensurePostProductFacts } from "@/lib/post-product";
import { findSimilarSources } from "@/lib/similar-sources";
import { normalizeTraitsJson } from "@/lib/style-traits";
import { TOPIC_LENGTHS } from "@/lib/topic-length";
import { recordUserUsage } from "@/lib/usage-meter";
import { Prisma } from "@prisma/client";

const generateSchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  productHighlights: z.string().trim().max(2000).optional().nullable(),
  captionTone: z.string().trim().min(1).max(200).optional().nullable(),
  length: z.enum(TOPIC_LENGTHS).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const genLimit = await assertCanGenerate(userId!);
  if (genLimit) return genLimit;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = generateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError("keyword가 올바르지 않습니다.", 400);
  }

  const keyword = parsed.data.keyword?.trim() || post.keyword?.trim();
  if (!keyword) {
    return jsonError("키워드가 필요합니다.", 400);
  }

  const productHighlights =
    parsed.data.productHighlights !== undefined
      ? parsed.data.productHighlights?.trim() || null
      : post.productHighlights;
  const captionTone =
    parsed.data.captionTone !== undefined
      ? parsed.data.captionTone?.trim() || null
      : post.captionTone;

  const factsDirty =
    keyword !== post.keyword || productHighlights !== post.productHighlights;
  if (factsDirty || captionTone !== post.captionTone) {
    await prisma.post.update({
      where: { id },
      data: {
        keyword,
        productHighlights,
        captionTone,
        ...(factsDirty ? { productFactsJson: Prisma.DbNull } : {}),
      },
    });
  }

  // --- Context assembly (ONCE for both providers) ---
  console.info("[generate] assembling shared draft context");
  await ensureMinimalStyleProfile(post.brandId);
  const styleProfile = await prisma.styleProfile.findUnique({
    where: { brandId: post.brandId },
  });
  if (!styleProfile) {
    return jsonError("스타일 프로필을 준비하지 못했습니다.", 400);
  }
  const brandTone = normalizeTraitsJson(styleProfile.traitsJson).tone;
  const voiceTone = resolveCaptionTone(captionTone, brandTone);

  const sampleAnchors = Array.isArray(styleProfile.sampleAnchors)
    ? (styleProfile.sampleAnchors as Array<{ excerpt?: string }>).filter(
        (a): a is { excerpt: string } => typeof a?.excerpt === "string",
      )
    : [];

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

  const productFacts = await ensurePostProductFacts({
    id: post.id,
    keyword,
    productHighlights,
    productFactsJson:
      keyword !== post.keyword || productHighlights !== post.productHighlights
        ? null
        : post.productFactsJson,
  });

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
  const similarSources = findSimilarSources(
    `${keyword}\n${productFacts.productName}\n${productFacts.highlights.join(" ")}\n${sceneKeywordBlob}`,
    sourceCorpus,
    3,
  ).map((s) => ({ title: s.title, excerpt: s.excerpt }));

  const sharedInput = {
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
    length: parsed.data.length || "medium",
  };

  console.info("[generate] context ready — calling GPT + Gemini in parallel");
  const parallel = await generateDraftsInParallel(sharedInput);
  const successes = parallel.filter((d) => !d.error && d.body.trim());

  if (!successes.length) {
    return jsonError("두 provider 모두 초안 생성에 실패했습니다.", 502);
  }

  const tokenIn = successes.reduce((s, d) => s + (d.tokenUsage?.input || 0), 0);
  const tokenOut = successes.reduce((s, d) => s + (d.tokenUsage?.output || 0), 0);
  await recordUserUsage(userId!, {
    generates: 1,
    llmInputTokens: tokenIn,
    llmOutputTokens: tokenOut,
  }).catch(() => undefined);

  // Replace previous candidate drafts
  await prisma.postDraft.deleteMany({ where: { postId: id } });

  const savedDrafts = [];
  for (const d of successes) {
    const bodyHtml = toEditorHtml(d.body, images, slotImages);
    const row = await prisma.postDraft.create({
      data: {
        postId: id,
        provider: d.provider,
        modelId: d.modelId,
        title: d.title,
        titleCandidates: d.titleCandidates,
        body: bodyHtml,
        tokenUsage: d.tokenUsage ?? undefined,
        isSelected: false,
      },
    });
    savedDrafts.push({
      id: row.id,
      provider: row.provider,
      modelId: row.modelId,
      title: row.title,
      titleCandidates: row.titleCandidates,
      body: row.body,
      isSelected: row.isSelected,
      createdAt: row.createdAt,
    });
  }

  const needsSelection = savedDrafts.length >= 2;

  // Single success → auto-select and sync to Post
  if (!needsSelection) {
    const only = savedDrafts[0];
    await prisma.postDraft.update({
      where: { id: only.id },
      data: { isSelected: true },
    });
    const updated = await prisma.post.update({
      where: { id },
      data: {
        keyword,
        productHighlights,
        captionTone,
        title: only.title,
        titleCandidates: only.titleCandidates ?? undefined,
        body: only.body,
        status: "draft",
      },
      include: {
        images: { orderBy: { orderIndex: "asc" } },
        brand: { select: { id: true, name: true } },
        drafts: { orderBy: { createdAt: "asc" } },
      },
    });

    return NextResponse.json({
      post: updated,
      needsSelection: false,
      drafts: [
        {
          ...only,
          isSelected: true,
          label: providerDisplayLabel(0),
        },
      ],
      productFacts,
      meta: {
        dual: true,
        succeeded: successes.map((s) => s.provider),
        failed: parallel
          .filter((d) => d.error)
          .map((d) => ({ provider: d.provider, error: d.error || "실패" })),
      },
    });
  }

  // Two successes → keep Post fields except keyword/tone; body waits for selection
  const updated = await prisma.post.update({
    where: { id },
    data: {
      keyword,
      productHighlights,
      captionTone,
      status: "draft",
    },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true } },
      drafts: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({
    post: updated,
    needsSelection: true,
    drafts: savedDrafts.map((d, i) => ({
      ...d,
      label: providerDisplayLabel(i),
    })),
    productFacts,
    meta: {
      dual: true,
      succeeded: successes.map((s) => s.provider),
      failed: parallel
        .filter((d) => d.error)
        .map((d) => ({ provider: d.provider, error: d.error || "실패" })),
    },
  });
}
