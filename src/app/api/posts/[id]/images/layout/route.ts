import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { MAX_IMAGE_GROUP_SIZE } from "@/lib/image-slots";
import { prisma } from "@/lib/prisma";

const layoutSchema = z.object({
  slots: z
    .array(
      z.object({
        type: z.enum(["single", "group"]),
        imageIds: z.array(z.string().min(1)).min(1).max(MAX_IMAGE_GROUP_SIZE),
      }),
    )
    .min(1),
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

  const parsed = layoutSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("slots 형식이 올바르지 않습니다.", 400);
  }

  const flatIds = parsed.data.slots.flatMap((slot) => slot.imageIds);
  const existingIds = new Set(post.images.map((img) => img.id));
  if (
    flatIds.length !== existingIds.size ||
    new Set(flatIds).size !== flatIds.length ||
    flatIds.some((imageId) => !existingIds.has(imageId))
  ) {
    return jsonError("이미지 ID 목록이 올바르지 않습니다.", 400);
  }

  for (const slot of parsed.data.slots) {
    if (slot.type === "single" && slot.imageIds.length !== 1) {
      return jsonError("단독 슬롯은 사진 1장만 가능합니다.", 400);
    }
    if (slot.type === "group" && (slot.imageIds.length < 2 || slot.imageIds.length > MAX_IMAGE_GROUP_SIZE)) {
      return jsonError(`묶음은 2~${MAX_IMAGE_GROUP_SIZE}장까지 가능합니다.`, 400);
    }
  }

  let orderIndex = 0;
  const updates: Array<ReturnType<typeof prisma.postImage.update>> = [];

  for (const slot of parsed.data.slots) {
    const groupId = slot.type === "group" ? randomUUID() : null;
    for (const imageId of slot.imageIds) {
      updates.push(
        prisma.postImage.update({
          where: { id: imageId },
          data: { orderIndex, groupId },
        }),
      );
      orderIndex += 1;
    }
  }

  await prisma.$transaction(updates);

  const images = await prisma.postImage.findMany({
    where: { postId: id },
    orderBy: { orderIndex: "asc" },
  });

  return NextResponse.json({ images });
}
