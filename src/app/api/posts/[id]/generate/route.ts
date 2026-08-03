import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { toEditorHtml } from "@/lib/content";
import { imagesToSlots } from "@/lib/image-slots";
import { resolveCaptionTone } from "@/lib/caption-tones";
import { generateBlogDraft } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { ensurePostProductFacts } from "@/lib/post-product";
import { findSimilarSources } from "@/lib/similar-sources";
import { normalizeTraitsJson } from "@/lib/style-traits";
import { Prisma } from "@prisma/client";

const generateSchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  productHighlights: z.string().trim().max(2000).optional().nullable(),
  captionTone: z.string().trim().min(1).max(200).optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

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

  const styleProfile = await prisma.styleProfile.findUnique({
    where: { brandId: post.brandId },
  });
  if (!styleProfile) {
    return jsonError("스타일 프로필이 없습니다. 먼저 문체를 학습하세요.", 400);
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
          images: slot.images.map((img) => ({ imageUrl: img.imageUrl, caption: img.caption })),
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

  let draft;
  try {
    draft = await generateBlogDraft({
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
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "초안 생성에 실패했습니다.";
    return jsonError(message, 502);
  }

  const bodyHtml = toEditorHtml(draft.body, images, slotImages);

  const updated = await prisma.post.update({
    where: { id },
    data: {
      keyword,
      productHighlights,
      captionTone,
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

  return NextResponse.json({
    post: updated,
    meta: draft.meta,
    productFacts,
  });
}
