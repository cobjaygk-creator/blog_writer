import { ChevronRight, ImageIcon } from "lucide-react";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { plainTextLength } from "@/lib/content";
import { getEntitlementSnapshot } from "@/lib/entitlements";
import { getPlanLimits, isUnlimitedEmail, normalizePlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

function initials(email?: string | null) {
  if (!email) return "U";
  return (email.split("@")[0] || email).slice(0, 2).toUpperCase();
}

export default async function MobileHomePage() {
  const session = await auth();
  const userId = session!.user!.id;
  const email = session!.user!.email;
  const plan = normalizePlan(session!.user!.plan);
  const unlimited = isUnlimitedEmail(email);
  const limits = getPlanLimits(plan, email);

  let usage = { used: 0, limit: limits.postsPerMonth };
  let photoCount = 0;
  let recentThumbs: string[] = [];
  let continueItems: {
    id: string;
    title: string;
    voiceName: string;
    images: number;
    hasBody: boolean;
    thumb: string | null;
    updatedAt: Date;
  }[] = [];

  try {
    const [entitlement, pendingImages, continueRows] = await Promise.all([
      getEntitlementSnapshot(userId, limits),
      prisma.postImage.findMany({
        where: { post: { brand: { userId }, status: "collecting" } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { imageUrl: true },
      }),
      prisma.post.findMany({
        where: { brand: { userId }, status: { in: ["collecting", "draft"] } },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          keyword: true,
          body: true,
          updatedAt: true,
          brand: { select: { name: true } },
          images: { orderBy: { orderIndex: "asc" }, take: 1, select: { imageUrl: true } },
          _count: { select: { images: true } },
        },
      }),
    ]);

    usage = { used: entitlement.meters.posts.used, limit: entitlement.meters.posts.limit };
    photoCount = pendingImages.length;
    recentThumbs = pendingImages.slice(0, 4).map((i) => i.imageUrl);
    continueItems = continueRows.map((p) => ({
      id: p.id,
      title: p.title || p.keyword || "(제목 없음)",
      voiceName: p.brand.name,
      images: p._count.images,
      hasBody: Boolean(p.body && plainTextLength(p.body) > 0),
      thumb: p.images[0]?.imageUrl ?? null,
      updatedAt: p.updatedAt,
    }));
  } catch {
    // best-effort home; render with empty state
  }

  const limitLabel = usage.limit === Number.MAX_SAFE_INTEGER ? "∞" : usage.limit;
  const thumbTints = ["bg-white/[.22]", "bg-white/[.18]", "bg-white/[.14]", "bg-white/[.1]"];

  return (
    <main className="flex flex-1 flex-col bg-[#F6F6F8] pb-[92px]">
      <div className="flex h-[54px] items-center gap-2.5 px-5">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--accent)] text-[12px] font-bold text-white">
          Di
        </span>
        <div className="flex-1" />
        {!unlimited ? (
          <span className="flex h-[30px] items-center rounded-full border border-[var(--border)] bg-white px-3 text-[12px] text-[#6B6B75] [font-variant-numeric:tabular-nums]">
            이번 달 {usage.used}/{limitLabel}
          </span>
        ) : null}
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#16161A] text-[12px] font-bold text-white">
          {initials(email)}
        </span>
      </div>

      <div className="flex flex-col gap-3.5 px-5 pt-1.5">
        <div className="flex flex-col gap-1">
          <h2 className="text-[24px] font-bold tracking-[-.02em] text-[var(--foreground)]">
            오늘 현장은요?
          </h2>
          <p className="text-[14px] text-[#6B6B75]">사진부터 고르면 나머지는 제가 씁니다.</p>
        </div>

        <Link
          href="/m/new"
          className="flex flex-col gap-3.5 rounded-[20px] bg-[var(--accent)] p-[22px] shadow-[0_6px_18px_rgba(75,59,255,.3)]"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/[.18]">
              <ImageIcon className="h-6 w-6 text-white" strokeWidth={1.8} />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[17px] font-bold text-white">사진 고르기</span>
              <span className="text-[12.5px] text-white/[.78]">
                {photoCount > 0
                  ? `최근 사진 ${photoCount}장 · 오늘 촬영`
                  : "현장 사진을 앨범에서 고릅니다"}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {thumbTints.map((tint, i) => {
              const url = recentThumbs[i];
              return (
                <span
                  key={i}
                  className={cn("h-16 overflow-hidden rounded-[11px]", tint)}
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
              );
            })}
          </div>
        </Link>

        <Link
          href="/m/new?topic=1"
          className="flex h-[52px] items-center justify-center rounded-[14px] border border-[#E0E0E6] bg-white text-[14.5px] font-semibold text-[#3A3A44]"
        >
          사진 없이 주제만 적기
        </Link>

        {continueItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="pt-1 text-[13px] font-bold text-[var(--foreground)]">이어서 하기</span>
            <div className="flex flex-col rounded-[14px] border border-[var(--border)] bg-white">
              {continueItems.map((item, i) => (
                <Link
                  key={item.id}
                  href={`/m/${item.id}`}
                  className={cn("flex items-center gap-3 p-3.5", i > 0 && "border-t border-[#F0F0F3]")}
                >
                  <span className="h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[10px] bg-[#E6E6EB]">
                    {item.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.thumb} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                      {item.title}
                    </span>
                    <span className="truncate text-[12px] text-[#9C9CA6] [font-variant-numeric:tabular-nums]">
                      {item.voiceName} · 사진 {item.images} ·{" "}
                      {item.hasBody ? "초안 있음" : "초안 없음"} · {relativeTime(item.updatedAt)}
                    </span>
                  </span>
                  <ChevronRight className="h-[19px] w-[19px] shrink-0 text-[#C2C2CC]" strokeWidth={2} />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
