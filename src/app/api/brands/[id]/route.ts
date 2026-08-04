import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedBrand, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const brand = await prisma.brand.findFirst({
    where: { id, userId: userId! },
    include: {
      sourcePosts: { orderBy: { createdAt: "desc" } },
      styleProfile: true,
      posts: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, title: true, status: true, keyword: true, createdAt: true },
      },
    },
  });

  if (!brand) return jsonError("테마를 찾을 수 없습니다.", 404);
  return NextResponse.json({ brand });
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("테마를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("테마 이름(1–80자)이 필요합니다.", 400);
  }

  const brand = await prisma.brand.update({
    where: { id },
    data: { name: parsed.data.name },
  });

  return NextResponse.json({ brand });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("테마를 찾을 수 없습니다.", 404);

  await prisma.brand.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
