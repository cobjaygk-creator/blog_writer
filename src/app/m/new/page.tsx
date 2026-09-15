import { MobileCompose } from "@/components/mobile/MobileCompose";
import { auth } from "@/lib/auth";
import { getEntitlementSnapshot } from "@/lib/entitlements";
import { getPlanLimits, isUnlimitedEmail, normalizePlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export default async function MobileNewPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  const session = await auth();
  const userId = session!.user!.id;
  const email = session!.user!.email;
  const plan = normalizePlan(session!.user!.plan);
  const unlimited = isUnlimitedEmail(email);
  const limits = getPlanLimits(plan, email);

  let voices: { id: string; name: string; version: number | null }[] = [];
  let used = 0;
  let limitLabel = "∞";

  try {
    const [brandRows, entitlement] = await Promise.all([
      prisma.brand.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, name: true, styleProfile: { select: { version: true } } },
      }),
      getEntitlementSnapshot(userId, limits),
    ]);
    voices = brandRows.map((b) => ({
      id: b.id,
      name: b.name,
      version: b.styleProfile?.version ?? null,
    }));
    used = entitlement.meters.posts.used;
    const lim = entitlement.meters.posts.limit;
    limitLabel = unlimited || lim === Number.MAX_SAFE_INTEGER ? "∞" : String(lim);
  } catch {
    // fall through with defaults
  }

  return (
    <MobileCompose
      voices={voices}
      usedThisMonth={used}
      monthlyLimit={limitLabel}
      topicOnly={topic === "1"}
    />
  );
}
