import { NextResponse } from "next/server";

import { getOwnedPost, jsonError, requireUserId } from "@/lib/api-helpers";
import { getPostCaptionTone } from "@/lib/post-caption-tone";
import { prisma } from "@/lib/prisma";
import { captionImage } from "@/lib/vision";

type Params = { params: Promise<{ id: string; imageId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, imageId } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const image = post.images.find((img) => img.id === imageId);
  if (!image) return jsonError("이미지를 찾을 수 없습니다.", 404);

  let result;
  try {
    const tone = await getPostCaptionTone(post.id, post.brandId, post.captionTone);
    const { ensurePostProductFacts, factHighlightForCaption } = await import(
      "@/lib/post-product"
    );
    const facts = await ensurePostProductFacts(post);
    const sceneHint = `${post.keyword || ""} ${image.caption || ""} ${facts.productName}`.trim();
    const factHighlight = await factHighlightForCaption(sceneHint, facts);
    result = await captionImage(image.imageUrl, {
      keyword: post.keyword,
      tone,
      factHighlight,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "캡션 생성에 실패했습니다.";
    return jsonError(message, 502);
  }

  const updated = await prisma.postImage.update({
    where: { id: imageId },
    data: { caption: result.caption },
  });

  return NextResponse.json({
    image: updated,
    meta: { usedFallback: result.usedFallback, provider: result.provider },
  });
}
