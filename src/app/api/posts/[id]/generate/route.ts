import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { generateBlogDraft } from "@/lib/llm";
import { prisma } from "@/lib/prisma";

const generateSchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
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

  const styleProfile = await prisma.styleProfile.findUnique({
    where: { brandId: post.brandId },
  });
  if (!styleProfile) {
    return jsonError("스타일 프로필이 없습니다. 먼저 문체를 학습하세요.", 400);
  }

  const sampleAnchors = Array.isArray(styleProfile.sampleAnchors)
    ? (styleProfile.sampleAnchors as Array<{ excerpt?: string }>).filter(
        (a): a is { excerpt: string } => typeof a?.excerpt === "string",
      )
    : [];

  const images = post.images.map((img) => ({
    imageUrl: img.imageUrl,
    caption: img.caption,
  }));

  let draft;
  try {
    draft = await generateBlogDraft({
      brandName: post.brand.name,
      keyword,
      styleSummary: styleProfile.summaryText,
      traitsJson: styleProfile.traitsJson,
      sampleAnchors,
      images,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "초안 생성에 실패했습니다.";
    return jsonError(message, 502);
  }

  const updated = await prisma.post.update({
    where: { id },
    data: {
      keyword,
      title: draft.title,
      titleCandidates: draft.titleCandidates,
      body: draft.body,
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
  });
}
