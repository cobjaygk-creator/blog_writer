import { requireAdmin, adminJson } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { startOfUtcDay } from "@/lib/plans";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 7)));
  const since = startOfUtcDay(new Date(Date.now() - (days - 1) * 86400000));
  const today = startOfUtcDay();

  const [
    newUsers,
    totalUsers,
    activeSubs,
    paymentsPaid,
    paymentsFailed,
    usageAgg,
    apiUsage,
    postsCreated,
    planGroups,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count(),
    prisma.subscription.count({ where: { status: { in: ["active", "trialing"] } } }),
    prisma.payment.aggregate({
      where: { status: "paid", createdAt: { gte: since } },
      _sum: { amountKrw: true },
      _count: true,
    }),
    prisma.payment.count({
      where: { status: "failed", createdAt: { gte: since } },
    }),
    prisma.usageDaily.aggregate({
      where: { day: { gte: since } },
      _sum: {
        generates: true,
        postsCreated: true,
        llmInputTokens: true,
        llmOutputTokens: true,
        estCostKrw: true,
      },
    }),
    prisma.apiUsageDaily.findMany({
      where: { day: { gte: since } },
      orderBy: [{ day: "asc" }, { slot: "asc" }],
    }),
    prisma.post.count({ where: { createdAt: { gte: since } } }),
    prisma.user.groupBy({ by: ["plan"], _count: true }),
  ]);

  const todayUsage = await prisma.usageDaily.aggregate({
    where: { day: today },
    _sum: { generates: true, estCostKrw: true },
  });

  const mrrRows = await prisma.subscription.findMany({
    where: { status: { in: ["active", "trialing"] } },
    include: { planProduct: { select: { priceMonthlyKrw: true, priceYearlyKrw: true } } },
  });
  const mrr = mrrRows.reduce((sum, s) => {
    if (s.interval === "yearly" && s.planProduct.priceYearlyKrw) {
      return sum + Math.round(s.planProduct.priceYearlyKrw / 12);
    }
    return sum + s.planProduct.priceMonthlyKrw;
  }, 0);

  return adminJson({
    range: { days, since: since.toISOString() },
    growth: {
      newUsers,
      totalUsers,
      postsCreated,
      generates: usageAgg._sum.generates || 0,
    },
    revenue: {
      mrr,
      activeSubscriptions: activeSubs,
      paidCount: paymentsPaid._count,
      paidAmountKrw: paymentsPaid._sum.amountKrw || 0,
      failedCount: paymentsFailed,
    },
    cost: {
      estCostKrw: usageAgg._sum.estCostKrw || 0,
      llmInputTokens: usageAgg._sum.llmInputTokens || 0,
      llmOutputTokens: usageAgg._sum.llmOutputTokens || 0,
    },
    today: {
      generates: todayUsage._sum.generates || 0,
      estCostKrw: todayUsage._sum.estCostKrw || 0,
    },
    plans: planGroups.map((g) => ({ plan: g.plan, count: g._count })),
    apiUsage,
  });
}
