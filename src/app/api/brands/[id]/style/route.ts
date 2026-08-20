import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedBrand, jsonError, parseJsonBody, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { STYLE_RULE_KEYS, toggleStyleRule } from "@/lib/style-rules";
import { normalizeTraitsJson } from "@/lib/style-traits";

const toneSchema = z.object({
  tone: z.string().trim().min(1).max(200),
});

const ruleSchema = z.object({
  ruleKey: z.enum(STYLE_RULE_KEYS as [string, ...string[]]),
  enabled: z.boolean(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("테마를 찾을 수 없습니다.", 404);

  const existing = await prisma.styleProfile.findUnique({ where: { brandId: id } });
  if (!existing) return jsonError("스타일 프로필이 없습니다. 먼저 문체를 학습하세요.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const ruleParsed = ruleSchema.safeParse(body);
  if (ruleParsed.success) {
    const nextTraits = toggleStyleRule(
      existing.traitsJson,
      existing.rawTraitsJson,
      ruleParsed.data.ruleKey as (typeof STYLE_RULE_KEYS)[number],
      ruleParsed.data.enabled,
    );
    const styleProfile = await prisma.styleProfile.update({
      where: { brandId: id },
      data: { traitsJson: nextTraits as Prisma.InputJsonValue },
    });
    return NextResponse.json({ styleProfile });
  }

  const toneParsed = toneSchema.safeParse(body);
  if (!toneParsed.success) {
    return jsonError("톤(1–200자) 또는 ruleKey/enabled가 필요합니다.", 400);
  }

  const traits = normalizeTraitsJson(existing.traitsJson);
  const styleProfile = await prisma.styleProfile.update({
    where: { brandId: id },
    data: {
      traitsJson: {
        ...traits,
        tone: toneParsed.data.tone,
      },
    },
  });

  return NextResponse.json({ styleProfile });
}
