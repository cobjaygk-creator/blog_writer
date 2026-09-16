import Link from "next/link";

import { HomeStart } from "@/components/studio/HomeStart";
import { auth } from "@/lib/auth";
import { plainTextLength } from "@/lib/content";
import { getEntitlementSnapshot } from "@/lib/entitlements";
import { getPlanLimits, isUnlimitedEmail, normalizePlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { Palette } from "lucide-react";

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

function greetingName(email?: string | null) {
  if (!email) return "";
  const local = email.split("@")[0]?.split(/[._+-]/)[0] ?? "";
  return local.trim();
}

export default async function HomePage() {
  const session = await auth();
  const userId = session!.user!.id;
  const email = session!.user!.email;

  const plan = normalizePlan(session!.user!.plan);
  const unlimited = isUnlimitedEmail(email);
  const limits = getPlanLimits(plan, email);

  let usage = { used: 0, limit: limits.postsPerMonth };
  let voices: { id: string; name: string; version: number | null }[] = [];
  let unlearned: { id: string; name: string }[] = [];
  let continueItems: {
    id: string;
    title: string;
    voiceName: string;
    images: number;
    chars: number;
    hasBody: boolean;
    emptyCaptions: number;
    needsCaptions: boolean;
    updatedAt: Date;
  }[] = [];
  let continueCount = 0;
  let dbError: string | null = null;

  try {
    const [entitlement, brandRows, continueRows, continueTotal] = await Promise.all([
      getEntitlementSnapshot(userId, limits),
      prisma.brand.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, name: true, styleProfile: { select: { version: true } } },
      }),
      prisma.post.findMany({
        where: { brand: { userId }, status: { in: ["collecting", "draft"] } },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          keyword: true,
          status: true,
          body: true,
          updatedAt: true,
          brand: { select: { name: true } },
          images: { select: { caption: true } },
        },
      }),
      prisma.post.count({
        where: { brand: { userId }, status: { in: ["collecting", "draft"] } },
      }),
    ]);

    usage = { used: entitlement.meters.posts.used, limit: entitlement.meters.posts.limit };
    voices = brandRows.map((b) => ({
      id: b.id,
      name: b.name,
      version: b.styleProfile?.version ?? null,
    }));
    unlearned = brandRows.filter((b) => !b.styleProfile).map((b) => ({ id: b.id, name: b.name }));
    continueCount = continueTotal;
    continueItems = continueRows.map((p) => {
      const emptyCaptions = p.images.filter((i) => !i.caption?.trim()).length;
      const hasBody = Boolean(p.body && plainTextLength(p.body) > 0);
      return {
        id: p.id,
        title: p.title || p.keyword || "(제목 없음)",
        voiceName: p.brand.name,
        images: p.images.length,
        chars: plainTextLength(p.body),
        hasBody,
        emptyCaptions,
        needsCaptions: p.status === "collecting" || emptyCaptions > 0,
        updatedAt: p.updatedAt,
      };
    });
  } catch {
    dbError = "정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  const usagePct =
    !unlimited && usage.limit > 0 && usage.limit !== Number.MAX_SAFE_INTEGER
      ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
      : 0;
  const name = greetingName(email);

  return (
    <main className="min-h-full bg-[#F6F6F8]">
      <div className="flex h-16 items-center gap-3.5 px-8">
        <div className="flex-1" />
        {!unlimited ? (
          <span className="flex h-8 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3.5 text-[12px] text-[var(--muted)]">
            이번 달{" "}
            <strong className="[font-variant-numeric:tabular-nums] text-[var(--foreground)]">
              {usage.used}
            </strong>
            /{usage.limit === Number.MAX_SAFE_INTEGER ? "∞" : usage.limit}회
            <span className="h-[5px] w-14 overflow-hidden rounded-full bg-[#EDEDF1]">
              <span
                className="block h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${usagePct}%` }}
              />
            </span>
          </span>
        ) : null}
        <Link
          href="/billing"
          className="flex h-8 items-center rounded-[9px] border border-[var(--border-strong)] bg-white px-3.5 text-[12.5px] font-semibold text-[#3A3A44] hover:border-[#C6C6CE]"
        >
          도움말
        </Link>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-8 pb-16 pt-[26px]">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[26px] font-bold tracking-[-.025em] text-[var(--foreground)]">
              {name ? `안녕하세요, ${name}님` : "안녕하세요"}
            </h2>
            <p className="text-[14.5px] text-[var(--muted)]">
              오늘은 어떤 재료로 쓸까요? 셋 중 하나만 고르면 됩니다.
            </p>
          </div>

          {dbError ? (
            <p className="rounded-[12px] border border-[#F0DFB4] bg-[#FDF9EE] px-4 py-3 text-[13px] text-[#8A6410]">
              {dbError}
            </p>
          ) : null}

          <HomeStart voices={voices} />

          {continueItems.length > 0 ? (
            <div className="mt-1.5 flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-bold text-[var(--foreground)]">이어서 하기</span>
                <span className="[font-variant-numeric:tabular-nums] flex h-[21px] items-center rounded-[6px] bg-[#F0F0F3] px-2 text-[11px] font-bold text-[var(--muted)]">
                  {continueCount}
                </span>
                <div className="flex-1" />
                <Link
                  href="/posts"
                  className="text-[12.5px] font-semibold text-[#8A8A94] hover:text-[var(--foreground)]"
                >
                  내 글 전체 →
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {continueItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2.5 rounded-[14px] border border-[var(--border)] bg-white p-3.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          item.needsCaptions
                            ? "flex h-[21px] items-center rounded-[6px] bg-[#F4EDD8] px-2 text-[10.5px] font-bold text-[#8A6410]"
                            : "flex h-[21px] items-center rounded-[6px] bg-[var(--accent-soft)] px-2 text-[10.5px] font-bold text-[var(--accent)]"
                        }
                      >
                        {item.needsCaptions
                          ? item.emptyCaptions > 0
                            ? `사진 설명 ${item.emptyCaptions}개`
                            : "사진 필요"
                          : "검수만 남음"}
                      </span>
                      <span className="ml-auto text-[11px] text-[var(--hint)]">
                        {relativeTime(item.updatedAt)}
                      </span>
                    </div>
                    <span className="line-clamp-2 text-[14px] font-semibold leading-[1.45] text-[var(--foreground)]">
                      {item.title}
                    </span>
                    <span className="[font-variant-numeric:tabular-nums] text-[12px] text-[var(--faint)]">
                      {item.voiceName} · 사진 {item.images} ·{" "}
                      {item.hasBody ? `${item.chars.toLocaleString()}자` : "초안 없음"}
                    </span>
                    <Link
                      href={`/posts/${item.id}`}
                      className={
                        item.needsCaptions
                          ? "flex h-[34px] items-center justify-center rounded-[9px] border border-[var(--border-strong)] bg-white text-[12.5px] font-semibold text-[#3A3A44] hover:border-[#C6C6CE]"
                          : "flex h-[34px] items-center justify-center rounded-[9px] bg-[#16161A] text-[12.5px] font-semibold text-white hover:bg-[#2A2A34]"
                      }
                    >
                      {item.needsCaptions ? "사진 설명 채우기" : "검수하고 올리기"}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {unlearned.length > 0 ? (
            <div className="mt-0.5 flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-white p-[13px_16px]">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent)]">
                <Palette className="h-[17px] w-[17px]" strokeWidth={1.8} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-[var(--foreground)]">
                  ‘{unlearned[0].name}’ 말투는 아직 학습 전입니다
                </span>
                <span className="text-[12px] text-[var(--faint)]">
                  기존 블로그 글 2~3편만 붙여넣으면 그 말투로 씁니다.
                </span>
              </div>
              <Link
                href={`/brands/${unlearned[0].id}`}
                className="ml-auto flex h-8 shrink-0 items-center rounded-[9px] border border-[var(--border-strong)] bg-white px-3.5 text-[12.5px] font-semibold text-[#3A3A44] hover:border-[#C6C6CE]"
              >
                말투 학습
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
