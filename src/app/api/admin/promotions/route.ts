import { z } from "zod";

import { adminJson, clientIp, requireAdmin, writeAdminAudit } from "@/lib/admin";
import { jsonError, parseJsonBody } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const promotions = await prisma.promotion.findMany({ orderBy: { createdAt: "desc" } });
  return adminJson({ promotions });
}

const createSchema = z.object({
  code: z.string().trim().min(2).max(40),
  percentOff: z.number().int().min(1).max(100).optional().nullable(),
  amountOffKrw: z.number().int().min(1).optional().nullable(),
  durationMonths: z.number().int().min(1).max(36).optional(),
  maxRedemptions: z.number().int().min(1).optional().nullable(),
  applicablePlans: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError("프로모션 요청이 올바르지 않습니다.", 400);
  if (!parsed.data.percentOff && !parsed.data.amountOffKrw) {
    return jsonError("할인율 또는 할인금액을 입력해 주세요.", 400);
  }

  const promo = await prisma.promotion.create({
    data: {
      code: parsed.data.code.toUpperCase(),
      percentOff: parsed.data.percentOff ?? null,
      amountOffKrw: parsed.data.amountOffKrw ?? null,
      durationMonths: parsed.data.durationMonths ?? 1,
      maxRedemptions: parsed.data.maxRedemptions ?? null,
      applicablePlans: parsed.data.applicablePlans ?? ["lite", "pro"],
      active: parsed.data.active ?? true,
    },
  });

  await writeAdminAudit({
    actorId: user!.id,
    action: "promotion.create",
    targetType: "Promotion",
    targetId: promo.id,
    afterJson: promo,
    ip: clientIp(request),
  });

  return adminJson({ promotion: promo }, { status: 201 });
}
