import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedBrand, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { assertCanCreatePost } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  brandId: z.string().min(1),
  keyword: z.string().trim().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("brandId가 필요합니다.", 400);
  }

  const brand = await getOwnedBrand(parsed.data.brandId, userId!);
  if (!brand) return jsonError("업체를 찾을 수 없습니다.", 404);

  const limitError = await assertCanCreatePost(userId!);
  if (limitError) return limitError;

  const post = await prisma.post.create({
    data: {
      brandId: brand.id,
      keyword: parsed.data.keyword,
      status: "collecting",
    },
  });

  return NextResponse.json({ post }, { status: 201 });
}
