import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedBrand, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { assertCanAddSourcePost } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  rawText: z.string().trim().min(20).max(20000),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("업체를 찾을 수 없습니다.", 404);

  const sourcePosts = await prisma.sourcePost.findMany({
    where: { brandId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sourcePosts });
}

export async function POST(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("업체를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("원문은 20자 이상 20,000자 이하여야 합니다.", 400);
  }

  const limitError = await assertCanAddSourcePost(userId!, id);
  if (limitError) return limitError;

  const sourcePost = await prisma.sourcePost.create({
    data: {
      brandId: id,
      rawText: parsed.data.rawText,
    },
  });

  return NextResponse.json({ sourcePost }, { status: 201 });
}
