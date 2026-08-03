import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  caption: z.string().trim().max(2000).nullable().optional(),
});

type Params = { params: Promise<{ id: string; imageId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, imageId } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const image = post.images.find((img) => img.id === imageId);
  if (!image) return jsonError("이미지를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("유효하지 않은 요청입니다.", 400);
  }

  const updated = await prisma.postImage.update({
    where: { id: imageId },
    data: {
      caption: parsed.data.caption === undefined ? undefined : parsed.data.caption,
    },
  });

  return NextResponse.json({ image: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, imageId } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const image = post.images.find((img) => img.id === imageId);
  if (!image) return jsonError("이미지를 찾을 수 없습니다.", 404);

  const orphanGroupId = image.groupId;

  await prisma.postImage.delete({ where: { id: imageId } });

  const remaining = await prisma.postImage.findMany({
    where: { postId: id },
    orderBy: { orderIndex: "asc" },
  });

  if (orphanGroupId) {
    const siblings = remaining.filter((img) => img.groupId === orphanGroupId);
    if (siblings.length < 2) {
      await prisma.postImage.updateMany({
        where: { postId: id, groupId: orphanGroupId },
        data: { groupId: null },
      });
    }
  }

  const refreshed = await prisma.postImage.findMany({
    where: { postId: id },
    orderBy: { orderIndex: "asc" },
  });
  await prisma.$transaction(
    refreshed.map((img, index) =>
      prisma.postImage.update({
        where: { id: img.id },
        data: { orderIndex: index },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}
