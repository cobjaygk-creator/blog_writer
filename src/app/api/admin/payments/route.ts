import { requireAdmin, adminJson } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;

  const payments = await prisma.payment.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, email: true } },
      subscription: { select: { id: true, status: true } },
    },
  });

  return adminJson({ payments });
}
