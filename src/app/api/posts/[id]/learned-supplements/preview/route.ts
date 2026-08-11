import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import {
  collectLearnedSupplements,
  learnedSupplementEnabled,
  resolveProductKey,
} from "@/lib/learned-supplement";
import { prisma } from "@/lib/prisma";

const previewSchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  productHighlights: z.string().trim().max(2000).optional().nullable(),
  imagePrompts: z.array(z.string().trim().max(500)).max(20).optional(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Preview same-product learned supplement points before draft generation.
 * Does not consume generate quota.
 */
export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  if (!learnedSupplementEnabled()) {
    return NextResponse.json({
      enabled: false,
      productKey: null,
      points: [],
      message: "학습 보충이 비활성화되어 있습니다.",
    });
  }

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = previewSchema.safeParse(body ?? {});
  if (!parsed.success) return jsonError("요청이 올바르지 않습니다.", 400);

  const full = await prisma.post.findFirst({
    where: { id, brand: { userId: userId! } },
    include: {
      images: { orderBy: { orderIndex: "asc" }, select: { caption: true } },
    },
  });
  if (!full) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const keyword = parsed.data.keyword?.trim() || full.keyword?.trim() || "";
  if (!keyword) return jsonError("키워드가 필요합니다.", 400);

  const notes =
    parsed.data.productHighlights !== undefined
      ? parsed.data.productHighlights?.trim() || null
      : full.productHighlights;
  const imagePrompts =
    parsed.data.imagePrompts?.length
      ? parsed.data.imagePrompts
      : full.images.map((img) => img.caption || "");

  // Runtime text match only (A-stage). Indexed columns are optional.
  const sources = await prisma.sourcePost.findMany({
    where: { brandId: full.brandId },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      rawText: true,
    },
  });

  const productKey = resolveProductKey({
    keyword,
    notes,
    productName: keyword,
  });

  const points = await collectLearnedSupplements({
    sources,
    keyword,
    notes,
    imagePrompts,
    productName: keyword,
    enabled: true,
  });

  return NextResponse.json({
    enabled: true,
    productKey: productKey
      ? {
          vehicle: productKey.vehicle,
          part: productKey.part,
          key: productKey.productKey,
          confidence: productKey.confidence,
        }
      : null,
    points,
    sourceCount: sources.length,
  });
}
