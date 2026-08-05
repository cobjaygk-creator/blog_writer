import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/api-helpers";
import { getMeterUsed } from "@/lib/entitlements";
import { getUserPlan } from "@/lib/plan-guards";
import { startOfUtcDay } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { getUserGeneratesToday } from "@/lib/usage-meter";

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { limits, planCode, unlimited, suspended } = await getUserPlan(userId!);
  const { used: postsMonthUsed } = await getMeterUsed(userId!, "posts");
  const generatesTodayUsed = await getUserGeneratesToday(userId!);
  const postsTodayUsed = await prisma.post.count({
    where: {
      brand: { userId: userId! },
      createdAt: { gte: startOfUtcDay() },
    },
  });

  const postsMonthRemaining = unlimited
    ? null
    : Math.max(0, limits.postsPerMonth - postsMonthUsed);
  const postsTodayRemaining = unlimited
    ? null
    : Math.max(0, limits.postsPerDay - postsTodayUsed);
  const generatesTodayRemaining = unlimited
    ? null
    : Math.max(0, limits.generatesPerDay - generatesTodayUsed);

  const canCreatePost =
    !suspended &&
    (unlimited ||
      (postsMonthUsed < limits.postsPerMonth && postsTodayUsed < limits.postsPerDay));
  const canGenerate =
    !suspended && (unlimited || generatesTodayUsed < limits.generatesPerDay);

  return NextResponse.json({
    planCode,
    unlimited,
    suspended,
    limits: {
      postsPerMonth: limits.postsPerMonth,
      postsPerDay: limits.postsPerDay,
      generatesPerDay: limits.generatesPerDay,
      dualGenerationEnabled: limits.dualGenerationEnabled,
    },
    usage: {
      postsMonth: { used: postsMonthUsed, limit: limits.postsPerMonth, remaining: postsMonthRemaining },
      postsToday: { used: postsTodayUsed, limit: limits.postsPerDay, remaining: postsTodayRemaining },
      generatesToday: {
        used: generatesTodayUsed,
        limit: limits.generatesPerDay,
        remaining: generatesTodayRemaining,
      },
    },
    canCreatePost,
    canGenerate,
  });
}
