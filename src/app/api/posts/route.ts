import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedBrand, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { BRAND_CAPTION_TONE } from "@/lib/caption-tones";
import { assertCanCreatePost } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  brandId: z.string().min(1),
  keyword: z.string().trim().min(1).max(120).optional(),
  productHighlights: z.string().trim().min(1).max(2000).optional().nullable(),
  captionTone: z.string().trim().min(1).max(200).optional().nullable(),
});

export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("brandId가 필요합니다.", 400);
  }

  const brand = await getOwnedBrand(parsed.data.brandId, userId!);
  if (!brand) return jsonError("업체를 찾을 수 없습니다.", 404);

  const styleProfile = await prisma.styleProfile.findUnique({
    where: { brandId: brand.id },
    select: { id: true },
  });
  if (!styleProfile) {
    return jsonError("문체 학습이 끝난 업체만 포스트를 만들 수 있습니다.", 400);
  }

  const limitError = await assertCanCreatePost(userId!);
  if (limitError) return limitError;

  const post = await prisma.post.create({
    data: {
      brandId: brand.id,
      keyword: parsed.data.keyword,
      productHighlights: parsed.data.productHighlights?.trim() || null,
      captionTone: parsed.data.captionTone?.trim() || BRAND_CAPTION_TONE,
      status: "collecting",
    },
  });

  return NextResponse.json({ post }, { status: 201 });
}
