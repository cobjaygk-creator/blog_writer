import { NextResponse } from "next/server";

import { getOwnedPost, jsonError, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { uploadImageBuffer } from "@/lib/storage";
import { captionImage } from "@/lib/vision";

type Params = { params: Promise<{ id: string }> };

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("multipart/form-data가 필요합니다.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("file 필드가 필요합니다.", 400);
  }
  if (!ALLOWED.has(file.type)) {
    return jsonError("jpeg/png/webp/gif만 업로드할 수 있습니다.", 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError("파일 크기는 8MB 이하여야 합니다.", 400);
  }

  const autoCaption = String(form.get("autoCaption") ?? "true") !== "false";
  const buffer = Buffer.from(await file.arrayBuffer());

  let imageUrl: string;
  try {
    ({ imageUrl } = await uploadImageBuffer({
      buffer,
      contentType: file.type,
      folder: `posts/${id}`,
    }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.";
    return jsonError(message, 502);
  }

  const maxOrder = await prisma.postImage.aggregate({
    where: { postId: id },
    _max: { orderIndex: true },
  });
  const orderIndex = (maxOrder._max.orderIndex ?? -1) + 1;

  let caption: string | null = null;
  if (autoCaption) {
    try {
      caption = await captionImage(imageUrl, post.keyword);
    } catch {
      caption = null;
    }
  }

  const image = await prisma.postImage.create({
    data: {
      postId: id,
      imageUrl,
      caption,
      orderIndex,
    },
  });

  if (post.status === "draft") {
    await prisma.post.update({
      where: { id },
      data: { status: "collecting" },
    });
  }

  return NextResponse.json({ image }, { status: 201 });
}
