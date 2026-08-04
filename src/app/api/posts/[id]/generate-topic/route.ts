import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { resolveCaptionTone } from "@/lib/caption-tones";
import { toEditorHtml } from "@/lib/content";
import { ensureMinimalStyleProfile } from "@/lib/default-theme";
import { uploadMaxImagesPerPost } from "@/lib/integrations";
import { fetchNewsImagesForTopic } from "@/lib/news-images";
import { assertCanGenerate, getUserPlan } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";
import { recordUserUsage } from "@/lib/usage-meter";
import {
  generateTopicBlogDraft,
  planTopicDraft,
  type TopicImageSlot,
} from "@/lib/topic-draft";
import { TOPIC_LENGTHS } from "@/lib/topic-length";
import { researchTopicBrief } from "@/lib/topic-research";
import {
  normalizeExtendedTraits,
  normalizeTraitsJson,
} from "@/lib/style-traits";
import {
  fetchSceneImagesForTopic,
  type StockImageResult,
} from "@/lib/unsplash";

const schema = z.object({
  topic: z.string().trim().min(2).max(200),
  length: z.enum(TOPIC_LENGTHS).optional(),
  imageCount: z.number().int().min(1).max(6).optional(),
  /** unsplash (default) | ai */
  imageSource: z.enum(["unsplash", "ai"]).optional(),
  /** When true (default), replace existing post images. */
  replaceImages: z.boolean().optional(),
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

  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError("주제를 2자 이상 입력해 주세요.", 400);
  }

  const topic = parsed.data.topic.trim();
  const length = parsed.data.length;
  const imageSourcePref = parsed.data.imageSource || "unsplash";
  const { limits } = await getUserPlan(userId!);
  const maxImages = Math.min(limits.imagesPerPost, uploadMaxImagesPerPost(), 6);
  const imageCount = Math.min(parsed.data.imageCount ?? 3, maxImages);
  const replaceImages = parsed.data.replaceImages !== false;

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

  // Always research for news-image fallback / grounding
  let research: Awaited<ReturnType<typeof researchTopicBrief>> | null = null;
  try {
    research = await researchTopicBrief(topic);
  } catch (e) {
    console.warn("[generate-topic] research failed:", e);
  }

  // Lightweight search if research failed but we may still need news images
  async function ensureNewsSearchHits() {
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

  let plan;
  try {
    plan = await planTopicDraft({
      topic,
      brandName: post.brand.name,
      imageCount,
      length,
      styleSummary: styleProfile?.summaryText,
      traitsJson: traitsForDraft,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "주제 기획에 실패했습니다.";
    return jsonError(message, 502);
  }

  const targetCount = Math.max(plan.sections.length, imageCount);
  let stockImages: Array<StockImageResult | null> = new Array(targetCount).fill(null);
  let imageErrors: Array<string | null> = new Array(targetCount).fill(null);
  let resolvedSource: "unsplash" | "ai" | "news" | "mixed" = imageSourcePref;
  let unsplashRateLimited = false;

  if (imageSourcePref === "ai") {
    const queries = Array.from({ length: targetCount }, (_, i) => {
      const section = plan.sections[i % plan.sections.length];
      return section.imagePrompt;
    });
    const stock = await fetchSceneImagesForTopic({
      queries,
      folder: `posts/${id}`,
      imageSource: "ai",
    });
    stockImages = stock.results;
    imageErrors = stock.errors;
    resolvedSource = "ai";
  } else {
    const queries = Array.from({ length: targetCount }, (_, i) => {
      const section = plan.sections[i % plan.sections.length];
      return `${section.sceneKeyword || section.heading} ${topic}`.slice(0, 100);
    });
    const stock = await fetchSceneImagesForTopic({
      queries,
      folder: `posts/${id}`,
      imageSource: "unsplash",
    });
    stockImages = stock.results;
    imageErrors = stock.errors;
    unsplashRateLimited = stock.rateLimited;
    resolvedSource = "unsplash";
  }

  // When AI checkbox is off: never generate AI images — only Unsplash and/or news
  const filled = stockImages.filter(Boolean).length;
  const needNews =
    imageSourcePref !== "ai" &&
    (unsplashRateLimited || filled < targetCount);

  if (needNews) {
    research = await ensureNewsSearchHits();
  }

  if (needNews && research) {
    const news = await fetchNewsImagesForTopic({
      sources: research.sources,
      hits: research.hits,
      count: targetCount,
      folder: `posts/${id}`,
      topic,
    });

    if (news.usedNews) {
      // Prefer filling empty slots; if Unsplash was rate-limited and produced nothing,
      // use news for all slots. Keep existing Unsplash wins when present.
      for (let i = 0; i < targetCount; i++) {
        if (!stockImages[i] && news.results[i]) {
          stockImages[i] = news.results[i];
          imageErrors[i] = null;
        }
      }
      // If still empty but news has extras packed at front, compact-fill
      const newsPool = news.results.filter(Boolean) as StockImageResult[];
      let ni = 0;
      for (let i = 0; i < targetCount; i++) {
        if (stockImages[i]) continue;
        while (ni < newsPool.length && stockImages.some((s) => s?.imageUrl === newsPool[ni]?.imageUrl)) {
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

  const createdCountPreview = stockImages.filter(Boolean).length;
  if (createdCountPreview === 0) {
    const firstErr =
      imageErrors.find(Boolean) ||
      (unsplashRateLimited
        ? "Unsplash 한도 초과 후 관련 뉴스 이미지도 찾지 못했습니다."
        : "이미지를 가져오지 못했습니다.");
    return jsonError(`이미지 준비 실패: ${firstErr}`, 502);
  }

  if (replaceImages && post.images.length) {
    await prisma.postImage.deleteMany({ where: { postId: id } });
  }

  const startOrder = replaceImages
    ? 0
    : (await prisma.postImage.aggregate({
        where: { postId: id },
        _max: { orderIndex: true },
      }))._max.orderIndex ?? -1;

  const slots: TopicImageSlot[] = [];
  const createdImages: Array<{
    id: string;
    imageUrl: string;
    caption: string | null;
    orderIndex: number;
    groupId: string | null;
  }> = [];

  let order = replaceImages ? 0 : startOrder + 1;
  for (let i = 0; i < targetCount; i++) {
    const section = plan.sections[Math.min(i, plan.sections.length - 1)];
    const stock = stockImages[i];
    // Prefer news attribution caption already set by fetchNewsImagesForTopic
    const caption =
      stock?.caption ||
      `${resolvedSource === "ai" ? "AI 생성" : "참고 이미지"} · ${section.sceneKeyword}`.slice(
        0,
        200,
      );

    if (stock?.imageUrl) {
      const image = await prisma.postImage.create({
        data: {
          postId: id,
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

  let draft;
  try {
    draft = await generateTopicBlogDraft({
      topic,
      brandName: post.brand.name,
      plan,
      slots,
      length,
      styleSummary: styleProfile?.summaryText,
      traitsJson: traitsForDraft,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "토픽 초안 생성에 실패했습니다.";
    return jsonError(message, 502);
  }

  const imageInputs = createdImages.map((img) => ({
    imageUrl: img.imageUrl,
    caption: img.caption,
  }));
  const bodyHtml = toEditorHtml(draft.body, imageInputs, createdImages);

  const updated = await prisma.post.update({
    where: { id },
    data: {
      mode: "topic",
      keyword: topic.slice(0, 120),
      title: draft.title,
      titleCandidates: draft.titleCandidates,
      body: bodyHtml,
      status: "draft",
    },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true } },
    },
  });

  await recordUserUsage(userId!, { generates: 1 }).catch(() => undefined);

  return NextResponse.json({
    post: updated,
    meta: {
      ...draft.meta,
      topicPlan: {
        title: plan.title,
        sectionCount: plan.sections.length,
        disclaimer: plan.disclaimer,
      },
      research: research
        ? {
            isNewsTopic: research.isNewsTopic,
            factCount: research.facts.length,
            sourceCount: research.sources.length,
          }
        : null,
      images: {
        source: resolvedSource,
        unsplashRateLimited,
        requested: imageCount,
        created: createdImages.length,
        usedFallback: stockImages.some((g) => g?.usedFallback),
        errors: imageErrors.filter(Boolean),
      },
    },
  });
}
