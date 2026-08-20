import Link from "next/link";

import { PostWizard } from "@/components/PostWizard";
import { StudioQuickCreate } from "@/components/studio/StudioQuickCreate";
import { auth } from "@/lib/auth";
import { getEntitlementSnapshot } from "@/lib/entitlements";
import { getPlanLimits, isUnlimitedEmail, normalizePlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { isStudioUiEnabled } from "@/lib/studio-ui";
import { normalizeTraitsJson } from "@/lib/style-traits";

type Props = { searchParams: Promise<{ brandId?: string }> };

export default async function NewPostPage({ searchParams }: Props) {
  const session = await auth();
  const userId = session!.user!.id;
  const { brandId } = await searchParams;
  const brands = await prisma.brand.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      styleProfile: { select: { version: true, traitsJson: true } },
    },
  });

  const brandOptions = brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    learned: Boolean(brand.styleProfile),
    brandTone: brand.styleProfile
      ? normalizeTraitsJson(brand.styleProfile.traitsJson).tone
      : null,
  }));

  if (isStudioUiEnabled()) {
    const plan = normalizePlan(session!.user!.plan);
    const unlimited = isUnlimitedEmail(session!.user!.email);
    const limits = getPlanLimits(plan, session!.user!.email);
    const [entitlement, recentJobs] = await Promise.all([
      getEntitlementSnapshot(userId, limits),
      prisma.postGenerationJob.findMany({
        where: { userId, kind: "generate", status: "completed" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { createdAt: true, updatedAt: true },
      }),
    ]);
    const remainingPosts = unlimited ? null : entitlement.meters.posts.remaining;
    const estimatedSeconds =
      recentJobs.length > 0
        ? Math.round(
            recentJobs.reduce((sum, j) => sum + (j.updatedAt.getTime() - j.createdAt.getTime()), 0) /
              recentJobs.length /
              1000,
          )
        : null;

    return (
      <main>
        <StudioQuickCreate
          brands={brandOptions}
          initialBrandId={brandId || null}
          remainingPosts={remainingPosts}
          estimatedSeconds={estimatedSeconds}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-[color:var(--muted)] hover:text-[var(--accent)]"
      >
        ← 대시보드
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-[color:var(--foreground)]">
        새 글 만들기
      </h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        입력만 마치면 편집기로 넘어가 초안 생성·비교·문체 보정이 이어집니다.
      </p>
      <div className="mt-8">
        <PostWizard initialBrandId={brandId || null} brands={brandOptions} />
      </div>
    </main>
  );
}
