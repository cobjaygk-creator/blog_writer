import { NextResponse } from "next/server";

import { getOwnedPost, jsonError, requireUserId } from "@/lib/api-helpers";
import { uploadMaxBytes } from "@/lib/integrations";
import { assertCanAddImage } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";
import { uploadImageBuffer } from "@/lib/storage";
import { captionImage } from "@/lib/vision";

type Params = { params: Promise<{ id: string }> };

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const limitError = await assertCanAddImage(userId!, post.images.length);
  if (limitError) return limitError;

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

  const maxBytes = uploadMaxBytes();
  if (file.size > maxBytes) {
    return jsonError(`파일 크기는 ${Math.floor(maxBytes / (1024 * 1024))}MB 이하여야 합니다.`, 400);
  }

  const autoCaption = String(form.get("autoCaption") ?? "true") !== "false";
  const buffer = Buffer.from(await file.arrayBuffer());

  let upload;
  try {
    upload = await uploadImageBuffer({
      buffer,
      contentType: file.type,
      folder: `posts/${id}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.";
    return jsonError(message, 502);
  }

  const maxOrder = await prisma.postImage.aggregate({
    where: { postId: id },
    _max: { orderIndex: true },
  });
  const orderIndex = (maxOrder._max.orderIndex ?? -1) + 1;

  let image = await prisma.postImage.create({
    data: {
      postId: id,
      imageUrl: upload.imageUrl,
      caption: null,
      orderIndex,
    },
  });

  let captionMeta: { usedFallback: boolean; provider: "vision" | "fallback" } | null = null;
  let captionError: string | null = null;
  if (autoCaption) {
    try {
      const { ensurePostProductFacts, factHighlightForCaption } = await import(
        "@/lib/post-product"
      );
      const facts = await ensurePostProductFacts(post);
      const sceneHint = `${post.keyword || ""} ${facts.productName}`.trim();
      const factHighlight = await factHighlightForCaption(sceneHint, facts);
      const result = await captionImage(upload.imageUrl, {
        keyword: post.keyword,
        factHighlight,
      });
      image = await prisma.postImage.update({
        where: { id: image.id },
        data: { caption: result.caption },
      });
      captionMeta = { usedFallback: result.usedFallback, provider: result.provider };
    } catch (e) {
      captionError = e instanceof Error ? e.message : "장면 키워드 제안에 실패했습니다.";
    }
  }

  // Keep draft status when a body already exists so editing/save stay unlocked.
  const hasBody = Boolean(post.body?.replace(/<[^>]+>/g, "").trim());
  if (post.status === "draft" && !hasBody) {
    await prisma.post.update({
      where: { id },
      data: { status: "collecting" },
    });
  }

  return NextResponse.json(
    {
      image,
      meta: {
        storage: {
          provider: upload.provider,
          usedFallback: upload.usedFallback,
          contentType: upload.contentType,
        },
        caption: captionMeta,
        captionError,
      },
    },
    { status: 201 },
  );
}
