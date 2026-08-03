import { NextResponse } from "next/server";

import { getOwnedBrand, jsonError, requireUserId } from "@/lib/api-helpers";
import { learnStyleFromSources } from "@/lib/llm";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("업체를 찾을 수 없습니다.", 404);

  const sourcePosts = await prisma.sourcePost.findMany({
    where: { brandId: id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  if (sourcePosts.length === 0) {
    return jsonError("학습할 원문이 없습니다. 먼저 원문을 등록하세요.", 400);
  }

  let learned;
  try {
    learned = await learnStyleFromSources(
      sourcePosts.map((s) => ({ id: s.id, rawText: s.rawText })),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "스타일 학습에 실패했습니다.";
    return jsonError(message, 502);
  }

  const existing = await prisma.styleProfile.findUnique({ where: { brandId: id } });
  const styleProfile = existing
    ? await prisma.styleProfile.update({
        where: { brandId: id },
        data: {
          summaryText: learned.summaryText,
          sampleAnchors: learned.sampleAnchors,
          traitsJson: learned.traitsJson,
          version: existing.version + 1,
        },
      })
    : await prisma.styleProfile.create({
        data: {
          brandId: id,
          summaryText: learned.summaryText,
          sampleAnchors: learned.sampleAnchors,
          traitsJson: learned.traitsJson,
        },
      });

  return NextResponse.json({ styleProfile });
}
