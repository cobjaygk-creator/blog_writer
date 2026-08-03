import { NextResponse } from "next/server";

import { getOwnedPost, jsonError, requireUserId } from "@/lib/api-helpers";
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

  let caption: string;
  try {
    caption = await captionImage(image.imageUrl, post.keyword);
  } catch (e) {
    const message = e instanceof Error ? e.message : "캡션 생성에 실패했습니다.";
    return jsonError(message, 502);
  }

  const updated = await prisma.postImage.update({
    where: { id: imageId },
    data: { caption },
  });

  return NextResponse.json({ image: updated });
}
