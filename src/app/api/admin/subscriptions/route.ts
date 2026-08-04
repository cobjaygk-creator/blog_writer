import { requireAdmin, adminJson } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const subscriptions = await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, email: true } },
      planProduct: { select: { code: true, name: true, priceMonthlyKrw: true } },
    },
  });

  return adminJson({ subscriptions });
}
