import Link from "next/link";
import type { ReactNode } from "react";

import { NewCutLink } from "@/components/NewCutLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { plainTextLength } from "@/lib/content";
import { getEntitlementSnapshot } from "@/lib/entitlements";
import { getPlanLimits, isUnlimitedEmail, normalizePlan } from "@/lib/plans";
import { postStatusLabel } from "@/lib/post-status";
import { prisma } from "@/lib/prisma";

type ContinueFilter = "all" | "draft" | "collecting";

type ContinuePost = {
  id: string;
  title: string | null;
  status: string;
  createdAt: Date;
  brand: { name: string };
  _count: { images: number };
  body: string | null;
};

type BrandRow = {
  id: string;
  name: string;
  createdAt: Date;
  styleProfile: { version: number } | null;
  _count: { sourcePosts: number; posts: number };
};

function relativeTime(date: Date) {
  const min = Math.floor((Date.now() - date.getTime()) / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return `${Math.floor(day / 7)}주 전`;
}

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

function last14DayKeys() {
  const days: string[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function Sparkline({ values, color = "var(--accent)" }: { values: number[]; color?: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <div className="h-[26px]" />;
  }
  const w = 160;
  const h = 26;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function DurationBars({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="h-[26px]" />;
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-[26px] items-end gap-[3px]">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[2px]"
          style={{
            height: `${Math.max(10, (v / max) * 100)}%`,
            background: i === values.length - 1 ? "var(--accent)" : "#EDEDF1",
          }}
        />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  chart,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  chart?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[9px] rounded-[11px] border border-[var(--border)] bg-white p-[14px_15px]">
      <span className="text-[11px] font-semibold text-[var(--faint)]">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="[font-variant-numeric:tabular-nums] text-[27px] font-bold tracking-[-.035em] text-[var(--foreground)]">
          {value}
        </span>
        {suffix ? <span className="text-[12px] text-[var(--faint)]">{suffix}</span> : null}
      </div>
      {chart}
    </div>
  );
}

const TAB_LABELS: { id: ContinueFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "draft", label: "초안" },
  { id: "collecting", label: "준비 중" },
];

type Props = { searchParams: Promise<{ status?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;
  const filter: ContinueFilter =
    statusParam === "draft" || statusParam === "collecting" ? statusParam : "all";

  const session = await auth();
  const userId = session!.user!.id;

  const plan = normalizePlan(session!.user!.plan);
  const unlimited = isUnlimitedEmail(session!.user!.email);
  const limits = getPlanLimits(plan, session!.user!.email);

  let brands: BrandRow[] = [];
  let brandCount = 0;
  let learnedBrandCount = 0;
  let continuePosts: ContinuePost[] = [];
  let continueCounts: Record<ContinueFilter, number> = { all: 0, draft: 0, collecting: 0 };
  let postsUsed = 0;
  let postsLimit = limits.postsPerMonth;
  let publishedCount = 0;
  let publishedSpark: number[] = [];
  let avgDurationMs = 0;
  let durationBars: number[] = [];
  let postsSpark: number[] = [];
  let usageMeters: {
    posts: { used: number; limit: number };
    shorts: { used: number; limit: number };
    generates: { used: number; limit: number };
  } | null = null;
  let dbError: string | null = null;

  try {
    const entitlement = await getEntitlementSnapshot(userId, limits);
    const periodStart = new Date(entitlement.periodStart);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setUTCHours(0, 0, 0, 0);
    fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 13);

    postsUsed = entitlement.meters.posts.used;
    postsLimit = entitlement.meters.posts.limit;
    usageMeters = entitlement.meters;

    const [
      brandRows,
      brandTotal,
      brandLearned,
      continueRows,
      continueGroups,
      publishedPosts,
      completedJobs,
      usageDailyRows,
    ] = await Promise.all([
      prisma.brand.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          name: true,
          createdAt: true,
          styleProfile: { select: { version: true } },
          _count: { select: { sourcePosts: true, posts: true } },
        },
      }),
      prisma.brand.count({ where: { userId } }),
      prisma.brand.count({ where: { userId, styleProfile: { isNot: null } } }),
      prisma.post.findMany({
        where: {
          brand: { userId },
          status: filter === "all" ? { in: ["collecting", "draft"] } : filter,
        },
        orderBy: { createdAt: "desc" },
        take: 14,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          brand: { select: { name: true } },
          _count: { select: { images: true } },
          body: true,
        },
      }),
      prisma.post.groupBy({
        by: ["status"],
        where: { brand: { userId }, status: { in: ["collecting", "draft"] } },
        _count: true,
      }),
      prisma.post.findMany({
        where: { brand: { userId }, status: "published", publishedAt: { gte: periodStart } },
        select: { publishedAt: true },
      }),
      prisma.postGenerationJob.findMany({
        where: { userId, kind: "generate", status: "completed", createdAt: { gte: periodStart } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { createdAt: true, updatedAt: true },
      }),
      prisma.usageDaily.findMany({
        where: { userId, day: { gte: fourteenDaysAgo } },
        select: { day: true, postsCreated: true },
      }),
    ]);

    brands = brandRows;
    brandCount = brandTotal;
    learnedBrandCount = brandLearned;
    continuePosts = continueRows;

    const draftCount = continueGroups.find((g) => g.status === "draft")?._count ?? 0;
    const collectingCount = continueGroups.find((g) => g.status === "collecting")?._count ?? 0;
    continueCounts = { all: draftCount + collectingCount, draft: draftCount, collecting: collectingCount };

    publishedCount = publishedPosts.length;

    if (completedJobs.length > 0) {
      const totalMs = completedJobs.reduce(
        (sum, job) => sum + (job.updatedAt.getTime() - job.createdAt.getTime()),
        0,
      );
      avgDurationMs = totalMs / completedJobs.length;
    }
    durationBars = completedJobs
      .slice(0, 7)
      .map((job) => job.updatedAt.getTime() - job.createdAt.getTime())
      .reverse();

    const dayKeys = last14DayKeys();
    const postsByDay = new Map(usageDailyRows.map((r) => [r.day.toISOString().slice(0, 10), r.postsCreated]));
    const publishedByDay = new Map<string, number>();
    for (const p of publishedPosts) {
      if (!p.publishedAt) continue;
      const key = p.publishedAt.toISOString().slice(0, 10);
      publishedByDay.set(key, (publishedByDay.get(key) ?? 0) + 1);
    }
    postsSpark = dayKeys.map((k) => postsByDay.get(k) ?? 0);
    publishedSpark = dayKeys.map((k) => publishedByDay.get(k) ?? 0);
  } catch {
    dbError = "DB에 연결하지 못했습니다. DATABASE_URL과 prisma migrate를 확인해 주세요.";
  }

  const learnRate = brandCount > 0 ? Math.round((learnedBrandCount / brandCount) * 100) : 0;

  return (
    <main className="flex w-full flex-col gap-[18px] p-[22px_24px]">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11.5px] text-[var(--faint)]">
          {session!.user!.email}
          <span className="mx-2 text-[var(--border-strong)]">·</span>
          <span className="font-bold text-[var(--accent)]">{unlimited ? "UNLIMITED" : plan.toUpperCase()}</span>
          <span className="ml-2">
            {unlimited
              ? "사용한도 무제한"
              : `테마 ${limits.brands} · 원문/테마 ${limits.sourcePostsPerBrand} · 이미지/글 ${limits.imagesPerPost}`}
          </span>
        </p>
        <NewCutLink>
          <Button type="button" variant="outline" size="sm">
            New Cut 쇼츠
          </Button>
        </NewCutLink>
      </div>

      {dbError ? (
        <p className="rounded-[8px] border border-[#F4EDD8] bg-[#F4EDD8] px-4 py-3 text-sm text-[#8A6410]">
          {dbError}
        </p>
      ) : null}

      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="이번 달 생성"
          value={postsUsed}
          suffix={`/ ${postsLimit === Number.MAX_SAFE_INTEGER ? "∞" : postsLimit}`}
          chart={<Sparkline values={postsSpark} />}
        />
        <StatCard
          label="발행 완료"
          value={publishedCount}
          suffix="건"
          chart={<Sparkline values={publishedSpark} color="#B4B4BE" />}
        />
        <StatCard
          label="평균 생성 시간"
          value={avgDurationMs > 0 ? formatDuration(avgDurationMs) : "—"}
          chart={<DurationBars values={durationBars} />}
        />
        <StatCard
          label="테마 학습률"
          value={brandCount > 0 ? `${learnRate}` : "—"}
          suffix={brandCount > 0 ? "%" : undefined}
          chart={
            brandCount > 0 ? (
              <div className="h-[5px] overflow-hidden rounded-full bg-[#EDEDF1]">
                <div className="h-full rounded-full bg-[#16161A]" style={{ width: `${learnRate}%` }} />
              </div>
            ) : (
              <div className="h-[5px]" />
            )
          }
        />
      </div>

      <div className="grid flex-1 grid-cols-[1fr_316px] gap-4">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[11px] border border-[var(--border)] bg-white">
          <div className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-[15px]">
            <span className="text-[12.5px] font-bold text-[var(--foreground)]">이어서 할 일</span>
            <Badge variant="neutral" className="[font-variant-numeric:tabular-nums]">
              {continueCounts.all}
            </Badge>
            <div className="flex-1" />
            <div className="flex gap-1">
              {TAB_LABELS.map((tab) => (
                <Link
                  key={tab.id}
                  href={tab.id === "all" ? "/dashboard" : `/dashboard?status=${tab.id}`}
                  className={
                    filter === tab.id
                      ? "flex h-[23px] items-center rounded-[6px] bg-[#16161A] px-2.5 text-[11px] font-semibold text-white"
                      : "flex h-[23px] items-center rounded-[6px] px-2.5 text-[11px] font-medium text-[#8A8A94] hover:bg-[var(--background)]"
                  }
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>
          <div
            className="grid h-[30px] shrink-0 items-center gap-0 border-b border-[#F0F0F3] bg-[var(--surface-2)] px-[15px] text-[10.5px] font-bold tracking-[.03em] text-[var(--faint)]"
            style={{ gridTemplateColumns: "1fr 108px 92px 74px" }}
          >
            <span>제목</span>
            <span>테마</span>
            <span>상태</span>
            <span className="text-right">수정</span>
          </div>
          {continuePosts.length === 0 ? (
            <p className="px-[15px] py-8 text-sm text-[var(--muted)]">
              {filter === "all" ? "이어서 작업할 글이 없습니다." : "해당 상태의 글이 없습니다."}
            </p>
          ) : (
            <div>
              {continuePosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="grid h-[47px] items-center gap-0 border-b border-[#F4F4F6] px-[15px] transition-colors last:border-b-0 hover:bg-[var(--surface-2)]"
                  style={{ gridTemplateColumns: "1fr 108px 92px 74px" }}
                >
                  <div className="flex min-w-0 flex-col gap-0.5 pr-3.5">
                    <span className="truncate text-[12.5px] font-semibold text-[var(--foreground)]">
                      {post.title || "(제목 없음)"}
                    </span>
                    <span className="[font-variant-numeric:tabular-nums] text-[10.5px] text-[var(--faint)]">
                      사진 {post._count.images} · {plainTextLength(post.body)}자
                    </span>
                  </div>
                  <span className="truncate pr-2.5 text-[11.5px] text-[var(--muted)]">{post.brand.name}</span>
                  <span>
                    <Badge variant={post.status === "collecting" ? "warning" : "accent"}>
                      {postStatusLabel(post.status)}
                    </Badge>
                  </span>
                  <span className="[font-variant-numeric:tabular-nums] text-right text-[11px] text-[var(--faint)]">
                    {relativeTime(post.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[13px] rounded-[11px] border border-[var(--border)] bg-white p-[15px]">
            <div className="flex items-center">
              <span className="text-[12.5px] font-bold text-[var(--foreground)]">이번 달 사용량</span>
              <span className="ml-auto text-[11px] font-semibold text-[var(--accent)]">
                {unlimited ? "UNLIMITED" : plan.toUpperCase()}
              </span>
            </div>
            {usageMeters ? (
              (
                [
                  ["블로그 글", usageMeters.posts],
                  ["쇼츠", usageMeters.shorts],
                  ["생성", usageMeters.generates],
                ] as const
              ).map(([label, meter]) => {
                const pct =
                  meter.limit > 0 && meter.limit !== Number.MAX_SAFE_INTEGER
                    ? Math.min(100, Math.round((meter.used / meter.limit) * 100))
                    : 0;
                return (
                  <div key={label} className="flex flex-col gap-[5px]">
                    <div className="flex text-[11.5px]">
                      <span className="text-[var(--muted)]">{label}</span>
                      <span className="[font-variant-numeric:tabular-nums] ml-auto font-semibold text-[var(--foreground)]">
                        {meter.used} / {meter.limit === Number.MAX_SAFE_INTEGER ? "∞" : meter.limit}
                      </span>
                    </div>
                    <div className="h-[5px] overflow-hidden rounded-full bg-[#EDEDF1]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[11px] border border-[var(--border)] bg-white">
            <div className="flex h-10 shrink-0 items-center border-b border-[var(--border)] px-[15px]">
              <span className="text-[12.5px] font-bold text-[var(--foreground)]">테마</span>
              <Link href="/brands" className="ml-auto text-[11px] font-semibold text-[#8A8A94] hover:text-[var(--foreground)]">
                전체 보기
              </Link>
            </div>
            <div className="p-1.5">
              {brands.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-[var(--muted)]">
                  등록된 테마가 없습니다.
                </p>
              ) : (
                brands.map((brand) => (
                  <Link
                    key={brand.id}
                    href={`/brands/${brand.id}`}
                    className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 hover:bg-[var(--surface-2)]"
                  >
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[#F0F0F3] text-[11px] font-bold text-[var(--muted)]">
                      {brand.name.slice(0, 1)}
                    </span>
                    <div className="flex min-w-0 flex-col gap-px">
                      <span className="truncate text-[12px] font-semibold text-[var(--foreground)]">
                        {brand.name}
                      </span>
                      <span className="[font-variant-numeric:tabular-nums] text-[10.5px] text-[var(--faint)]">
                        원문 {brand._count.sourcePosts} · 글 {brand._count.posts}
                      </span>
                    </div>
                    <Badge
                      variant={brand.styleProfile ? "accent" : "warning"}
                      className="ml-auto shrink-0"
                    >
                      {brand.styleProfile ? `v${brand.styleProfile.version}` : "미학습"}
                    </Badge>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
