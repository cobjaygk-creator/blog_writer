import { NextResponse } from "next/server";

import { getOwnedBrand, jsonError, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { generateStyleSample } from "@/lib/style-sample";
import { normalizeExtendedTraits } from "@/lib/style-traits";

type Params = { params: Promise<{ id: string }> };

/** One freshly generated example paragraph in the brand's learned voice. */
export async function POST(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("말투를 찾을 수 없습니다.", 404);

  const profile = await prisma.styleProfile.findUnique({ where: { brandId: id } });
  if (!profile) return jsonError("먼저 말투를 학습하세요.", 400);

  const traits = normalizeExtendedTraits(profile.traitsJson);
  const anchors = Array.isArray(profile.sampleAnchors)
    ? (profile.sampleAnchors as Array<{ excerpt?: unknown }>).filter(
        (a): a is { excerpt: string } => typeof a?.excerpt === "string",
      )
    : [];

  const { text, usedFallback } = await generateStyleSample({
    traits,
    summaryText: profile.summaryText || "",
    sampleAnchors: anchors,
  });

  return NextResponse.json({ sentence: text, usedFallback });
}
