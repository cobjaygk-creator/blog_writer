import { requireAdmin, adminJson } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get("take") || 50)));

  const users = await prisma.user.findMany({
    where: q
      ? { email: { contains: q, mode: "insensitive" } }
      : undefined,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      email: true,
      plan: true,
      role: true,
      planOverrideCode: true,
      planOverrideUntil: true,
      suspendedAt: true,
      createdAt: true,
      _count: { select: { brands: true, payments: true, subscriptions: true } },
    },
  });

  return adminJson({ users });
}
