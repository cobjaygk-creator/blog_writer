import { NextResponse } from "next/server";

import { getOwnedBrand, jsonError, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; postId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, postId } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("테마를 찾을 수 없습니다.", 404);

  const sourcePost = await prisma.sourcePost.findFirst({
    where: { id: postId, brandId: id },
  });
  if (!sourcePost) return jsonError("원문을 찾을 수 없습니다.", 404);

  await prisma.sourcePost.delete({ where: { id: postId } });
  return NextResponse.json({ ok: true });
}
