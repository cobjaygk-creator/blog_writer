import { NextResponse } from "next/server";

import { jsonError, requireUserId } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const sub = await prisma.subscription.findFirst({
    where: {
      userId: userId!,
      status: { in: ["active", "trialing", "past_due"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!sub) return jsonError("해지할 구독이 없습니다.", 404);

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
    },
  });

  return NextResponse.json({ subscription: updated });
}
