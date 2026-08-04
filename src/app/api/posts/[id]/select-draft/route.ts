import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  draftId: z.string().min(1),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError("draftId가 필요합니다.", 400);
  }

  const draft = await prisma.postDraft.findFirst({
    where: { id: parsed.data.draftId, postId: id },
  });
  if (!draft) return jsonError("초안을 찾을 수 없습니다.", 404);
  if (!draft.body?.trim()) {
    return jsonError("선택한 초안 본문이 비어 있습니다.", 400);
  }

  await prisma.$transaction([
    prisma.postDraft.updateMany({
      where: { postId: id },
      data: { isSelected: false },
    }),
    prisma.postDraft.update({
      where: { id: draft.id },
      data: { isSelected: true },
    }),
    prisma.post.update({
      where: { id },
      data: {
        title: draft.title,
        titleCandidates: draft.titleCandidates ?? undefined,
        body: draft.body,
        status: "draft",
      },
    }),
  ]);

  const updated = await prisma.post.findFirst({
    where: { id },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true } },
      drafts: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({
    post: updated,
    selectedDraftId: draft.id,
  });
}
