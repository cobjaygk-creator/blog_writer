import { NextResponse } from "next/server";

import { getOwnedPost, jsonError, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { ensurePostProductFacts } from "@/lib/post-product";
import { ensureProductReviewThemes } from "@/lib/product-review-cache";
import {
  applySceneKeywordMap,
  fillEmptyCaptionsWithKeyword,
  synthesizeSceneKeywords,
} from "@/lib/scene-keyword-fallback";

type Params = { params: Promise<{ id: string }> };

/** Fill empty PostImage captions (themes cache → keyword fallback). */
export async function POST(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const keyword = post.keyword?.trim();
  if (!keyword) return jsonError("키워드가 필요합니다.", 400);

  const full = await prisma.post.findFirst({
    where: { id, brand: { userId: userId! } },
    include: { images: { orderBy: { orderIndex: "asc" } } },
  });
  if (!full) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const productFacts = await ensurePostProductFacts({
    id: full.id,
    keyword,
    productHighlights: full.productHighlights,
    productFactsJson: full.productFactsJson,
  });

  let fillMap: Record<string, string> = {};
  try {
    const themes = await ensureProductReviewThemes({
      brandId: full.brandId,
      productName: productFacts.productName || keyword,
    });
    if (themes.length) {
      fillMap = synthesizeSceneKeywords(
        full.images.map((img) => ({ id: img.id, caption: img.caption })),
        themes,
      );
    }
  } catch (e) {
    console.warn("[fill-captions] review themes failed:", e);
  }

  const stillEmpty = full.images.filter((img) => !img.caption?.trim() && !fillMap[img.id]);
  if (stillEmpty.length) {
    fillMap = {
      ...fillMap,
      ...fillEmptyCaptionsWithKeyword(stillEmpty, keyword, {
        productName: productFacts.productName,
      }),
    };
  }

  const withCaptions = applySceneKeywordMap(
    full.images.map((img) => ({ id: img.id, caption: img.caption })),
    fillMap,
  );
  const updatedIds = Object.keys(fillMap);
  for (const img of withCaptions) {
    if (!fillMap[img.id]) continue;
    await prisma.postImage.update({
      where: { id: img.id },
      data: { caption: img.caption },
    });
  }

  const images = await prisma.postImage.findMany({
    where: { postId: id },
    orderBy: { orderIndex: "asc" },
  });

  return NextResponse.json({
    images,
    filled: updatedIds.length,
  });
}
