import { DITODIO_PRODUCT_CODE, startOfUtcMonth, type PlanLimits } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export type UsageMeter = "posts" | "shorts" | "generates";

export async function resolveBillingPeriodStart(userId: string, productCode = DITODIO_PRODUCT_CODE) {
  const sub = await prisma.subscription.findFirst({
    where: {
      userId,
      productCode,
      status: { in: ["active", "trialing"] },
    },
    orderBy: { createdAt: "desc" },
    select: { currentPeriodStart: true },
  });
  if (sub?.currentPeriodStart) {
    return new Date(
      Date.UTC(
        sub.currentPeriodStart.getUTCFullYear(),
        sub.currentPeriodStart.getUTCMonth(),
        sub.currentPeriodStart.getUTCDate(),
      ),
    );
  }
  return startOfUtcMonth();
}

export async function getMeterUsed(
  userId: string,
  meter: UsageMeter,
  productCode = DITODIO_PRODUCT_CODE,
) {
  const periodStart = await resolveBillingPeriodStart(userId, productCode);
  const row = await prisma.usagePeriod.findUnique({
    where: {
      userId_productCode_periodStart_meter: {
        userId,
        productCode,
        periodStart,
        meter,
      },
    },
    select: { used: true },
  });
  return { used: row?.used || 0, periodStart };
}

export async function incrementMeter(
  userId: string,
  meter: UsageMeter,
  delta = 1,
  productCode = DITODIO_PRODUCT_CODE,
) {
  const periodStart = await resolveBillingPeriodStart(userId, productCode);
  const row = await prisma.usagePeriod.upsert({
    where: {
      userId_productCode_periodStart_meter: {
        userId,
        productCode,
        periodStart,
        meter,
      },
    },
    create: {
      userId,
      productCode,
      periodStart,
      meter,
      used: delta,
    },
    update: { used: { increment: delta } },
  });
  return { used: row.used, periodStart };
}

export function meterLimit(limits: PlanLimits, meter: UsageMeter): number {
  if (meter === "posts") return limits.postsPerMonth;
  if (meter === "shorts") return limits.shortsPerMonth;
  return limits.generatesPerDay;
}

export async function getEntitlementSnapshot(
  userId: string,
  limits: PlanLimits,
  productCode = DITODIO_PRODUCT_CODE,
) {
  const periodStart = await resolveBillingPeriodStart(userId, productCode);
  const meters: UsageMeter[] = ["posts", "shorts", "generates"];
  const rows = await prisma.usagePeriod.findMany({
    where: { userId, productCode, periodStart, meter: { in: meters } },
  });
  const byMeter = new Map(rows.map((r) => [r.meter, r.used]));

  return {
    productCode,
    periodStart: periodStart.toISOString(),
    meters: {
      posts: {
        used: byMeter.get("posts") || 0,
        limit: limits.postsPerMonth,
        remaining: Math.max(0, limits.postsPerMonth - (byMeter.get("posts") || 0)),
      },
      shorts: {
        used: byMeter.get("shorts") || 0,
        limit: limits.shortsPerMonth,
        remaining: Math.max(0, limits.shortsPerMonth - (byMeter.get("shorts") || 0)),
      },
      generates: {
        used: byMeter.get("generates") || 0,
        limit: limits.generatesPerDay,
        remaining: Math.max(0, limits.generatesPerDay - (byMeter.get("generates") || 0)),
      },
    },
  };
}
