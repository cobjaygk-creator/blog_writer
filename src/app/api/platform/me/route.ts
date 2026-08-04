import { NextResponse } from "next/server";

import { getEntitlementSnapshot } from "@/lib/entitlements";
import { jsonError } from "@/lib/api-helpers";
import { getUserPlan } from "@/lib/plan-guards";
import { resolvePlatformActor } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const actor = await resolvePlatformActor(request);
  if (!actor) return jsonError("인증이 필요합니다.", 401);

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: {
      id: true,
      email: true,
      plan: true,
      role: true,
      suspendedAt: true,
    },
  });
  if (!user) return jsonError("사용자를 찾을 수 없습니다.", 404);
  if (user.suspendedAt) return jsonError("계정이 정지되어 있습니다.", 403);

  const { limits, planCode, unlimited } = await getUserPlan(user.id);
  const entitlements = await getEntitlementSnapshot(user.id, limits);

  return NextResponse.json({
    product: "ditodio",
    via: actor.via,
    user: {
      id: user.id,
      email: user.email,
      plan: planCode,
      role: user.role,
    },
    unlimited,
    limits,
    entitlements,
  });
}
