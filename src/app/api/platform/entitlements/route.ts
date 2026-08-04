import { NextResponse } from "next/server";

import { getEntitlementSnapshot } from "@/lib/entitlements";
import { jsonError } from "@/lib/api-helpers";
import { getUserPlan } from "@/lib/plan-guards";
import { listPlanProducts } from "@/lib/plan-product";
import { resolvePlatformActor } from "@/lib/platform-auth";

export async function GET(request: Request) {
  const actor = await resolvePlatformActor(request);
  if (!actor) return jsonError("인증이 필요합니다.", 401);

  const { limits, planCode, unlimited } = await getUserPlan(actor.userId);
  const entitlements = await getEntitlementSnapshot(actor.userId, limits);
  const catalog = (await listPlanProducts()).map((p) => ({
    code: p.code,
    name: p.name,
    description: p.description,
    priceMonthlyKrw: p.priceMonthlyKrw,
    postsPerMonth: p.postsPerMonth,
    shortsPerMonth: p.shortsPerMonth,
    brandsLimit: p.brandsLimit,
    isPurchasable: p.isPurchasable,
  }));

  return NextResponse.json({
    product: "ditodio",
    planCode,
    unlimited,
    limits,
    entitlements,
    catalog,
  });
}
