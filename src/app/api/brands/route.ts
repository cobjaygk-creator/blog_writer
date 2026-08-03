import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { assertCanCreateBrand } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const brands = await prisma.brand.findMany({
    where: { userId: userId! },
    orderBy: { createdAt: "desc" },
    include: {
      styleProfile: { select: { id: true, version: true, updatedAt: true } },
      _count: { select: { sourcePosts: true, posts: true } },
    },
  });

  return NextResponse.json({ brands });
}

export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("업체 이름(1–80자)이 필요합니다.", 400);
  }

  const limitError = await assertCanCreateBrand(userId!);
  if (limitError) return limitError;

  const brand = await prisma.brand.create({
    data: {
      userId: userId!,
      name: parsed.data.name,
    },
  });

  return NextResponse.json({ brand }, { status: 201 });
}
