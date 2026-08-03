import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedPost, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().max(100000).optional(),
  keyword: z.string().trim().min(1).max(120).optional().nullable(),
  status: z.enum(["collecting", "draft", "published", "archived"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const post = await getOwnedPost(id, userId!);
  if (!post) return jsonError("포스트를 찾을 수 없습니다.", 404);

  return NextResponse.json({ post });
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedPost(id, userId!);
  if (!owned) return jsonError("포스트를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("유효하지 않은 수정 요청입니다.", 400);
  }

  const post = await prisma.post.update({
    where: { id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      keyword: parsed.data.keyword === undefined ? undefined : parsed.data.keyword,
      status: parsed.data.status,
    },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ post });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedPost(id, userId!);
  if (!owned) return jsonError("포스트를 찾을 수 없습니다.", 404);

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
