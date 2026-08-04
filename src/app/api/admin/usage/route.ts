import { requireAdmin, adminJson } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { startOfUtcDay } from "@/lib/plans";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 7)));
  const since = startOfUtcDay(new Date(Date.now() - (days - 1) * 86400000));
  const tab = url.searchParams.get("tab") || "users";

  if (tab === "api") {
    const rows = await prisma.apiUsageDaily.findMany({
      where: { day: { gte: since } },
      orderBy: [{ day: "desc" }, { slot: "asc" }],
    });
    const bySlot = new Map<
      string,
      { requests: number; successes: number; failures: number; estCostKrw: number }
    >();
    for (const r of rows) {
      const cur = bySlot.get(r.slot) || {
        requests: 0,
        successes: 0,
        failures: 0,
        estCostKrw: 0,
      };
      cur.requests += r.requests;
      cur.successes += r.successes;
      cur.failures += r.failures;
      cur.estCostKrw += r.estCostKrw;
      bySlot.set(r.slot, cur);
    }
    return adminJson({
      days,
      slots: [...bySlot.entries()].map(([slot, v]) => ({ slot, ...v })),
      daily: rows,
    });
  }

  if (tab === "meters") {
    const rows = await prisma.usagePeriod.findMany({
      where: { periodStart: { gte: since } },
      include: { user: { select: { id: true, email: true, plan: true } } },
      orderBy: [{ periodStart: "desc" }, { used: "desc" }],
      take: 500,
    });
    const byUser = new Map<
      string,
      {
        userId: string;
        email: string;
        plan: string;
        posts: number;
        shorts: number;
        generates: number;
      }
    >();
    for (const r of rows) {
      const cur = byUser.get(r.userId) || {
        userId: r.userId,
        email: r.user.email,
        plan: r.user.plan,
        posts: 0,
        shorts: 0,
        generates: 0,
      };
      if (r.meter === "posts") cur.posts += r.used;
      else if (r.meter === "shorts") cur.shorts += r.used;
      else if (r.meter === "generates") cur.generates += r.used;
      byUser.set(r.userId, cur);
    }
    return adminJson({
      days,
      users: [...byUser.values()].sort((a, b) => b.posts + b.shorts - (a.posts + a.shorts)),
    });
  }

  const rows = await prisma.usageDaily.findMany({
    where: { day: { gte: since } },
    include: { user: { select: { id: true, email: true, plan: true } } },
    orderBy: [{ day: "desc" }, { generates: "desc" }],
    take: 500,
  });

  const byUser = new Map<
    string,
    {
      userId: string;
      email: string;
      plan: string;
      generates: number;
      postsCreated: number;
      llmInputTokens: number;
      llmOutputTokens: number;
      estCostKrw: number;
    }
  >();
  for (const r of rows) {
    const cur = byUser.get(r.userId) || {
      userId: r.userId,
      email: r.user.email,
      plan: r.user.plan,
      generates: 0,
      postsCreated: 0,
      llmInputTokens: 0,
      llmOutputTokens: 0,
      estCostKrw: 0,
    };
    cur.generates += r.generates;
    cur.postsCreated += r.postsCreated;
    cur.llmInputTokens += r.llmInputTokens;
    cur.llmOutputTokens += r.llmOutputTokens;
    cur.estCostKrw += r.estCostKrw;
    byUser.set(r.userId, cur);
  }

  return adminJson({
    days,
    users: [...byUser.values()].sort((a, b) => b.generates - a.generates),
  });
}
