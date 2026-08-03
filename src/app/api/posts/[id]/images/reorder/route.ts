import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("orderedIds 배열이 필요합니다.", 400);
  }

  const existingIds = new Set(post.images.map((img) => img.id));
  if (
    parsed.data.orderedIds.length !== existingIds.size ||
    parsed.data.orderedIds.some((imageId) => !existingIds.has(imageId))
  ) {
    return jsonError("이미지 ID 목록이 올바르지 않습니다.", 400);
  }

  await prisma.$transaction(
    parsed.data.orderedIds.map((imageId, index) =>
      prisma.postImage.update({
        where: { id: imageId },
        data: { orderIndex: index },
      }),
    ),
  );

  const images = await prisma.postImage.findMany({
    where: { postId: id },
    orderBy: { orderIndex: "asc" },
  });

  return NextResponse.json({ images });
}
