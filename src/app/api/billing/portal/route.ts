import { requireUserId } from "@/lib/api-helpers";
import { getUserPlan } from "@/lib/plan-guards";
import { listPlanProducts } from "@/lib/plan-product";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: userId! },
    select: {
      plan: true,
      planOverrideCode: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { planProduct: true },
      },
    },
  });

  const { limits, planCode } = await getUserPlan(userId!);
  const products = (await listPlanProducts()).filter((p) => p.isPublic && p.active);

  return NextResponse.json({
    planCode,
    limits,
    subscription: user?.subscriptions[0] || null,
    products,
  });
}
