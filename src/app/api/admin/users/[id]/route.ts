import { z } from "zod";

import { adminJson, clientIp, requireAdmin, writeAdminAudit } from "@/lib/admin";
import { jsonError, parseJsonBody } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      plan: true,
      role: true,
      planOverrideCode: true,
      planOverrideNote: true,
      planOverrideUntil: true,
      suspendedAt: true,
      createdAt: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { planProduct: true },
      },
      payments: { orderBy: { createdAt: "desc" }, take: 20 },
      usageDaily: { orderBy: { day: "desc" }, take: 30 },
      brands: { select: { id: true, name: true, createdAt: true }, take: 20 },
    },
  });
  if (!user) return jsonError("사용자를 찾을 수 없습니다.", 404);
  return adminJson({ user });
}

const patchSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  plan: z.enum(["free", "lite", "pro"]).optional(),
  planOverrideCode: z.string().trim().min(1).max(40).optional().nullable(),
  planOverrideNote: z.string().trim().max(500).optional().nullable(),
  planOverrideUntil: z.string().datetime().optional().nullable(),
  suspended: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { user: actor, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) return jsonError("사용자를 찾을 수 없습니다.", 404);

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("수정 요청이 올바르지 않습니다.", 400);

  const data: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.plan !== undefined) data.plan = parsed.data.plan;
  if (parsed.data.planOverrideCode !== undefined) {
    data.planOverrideCode = parsed.data.planOverrideCode;
  }
  if (parsed.data.planOverrideNote !== undefined) {
    data.planOverrideNote = parsed.data.planOverrideNote;
  }
  if (parsed.data.planOverrideUntil !== undefined) {
    data.planOverrideUntil = parsed.data.planOverrideUntil
      ? new Date(parsed.data.planOverrideUntil)
      : null;
  }
  if (parsed.data.suspended !== undefined) {
    data.suspendedAt = parsed.data.suspended ? new Date() : null;
  }

  const after = await prisma.user.update({ where: { id }, data });
  await writeAdminAudit({
    actorId: actor!.id,
    action: "user.update",
    targetType: "User",
    targetId: id,
    beforeJson: {
      plan: before.plan,
      role: before.role,
      planOverrideCode: before.planOverrideCode,
      suspendedAt: before.suspendedAt,
    },
    afterJson: {
      plan: after.plan,
      role: after.role,
      planOverrideCode: after.planOverrideCode,
      suspendedAt: after.suspendedAt,
    },
    ip: clientIp(request),
  });

  return adminJson({ user: after });
}
