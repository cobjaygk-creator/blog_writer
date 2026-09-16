import { Image as ImageIcon, Link as LinkIcon, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Skip the picker once a user has generated enough to already know their way around. */
const SKIP_AFTER_POST_COUNT = 3;

const CARDS: {
  route: "photo" | "topic" | "reference";
  label: string;
  subtitle: string;
  needs: string;
  result: string;
  icon: typeof ImageIcon;
}[] = [
  {
    route: "photo",
    label: "현장 사진으로",
    subtitle: "찍어 둔 사진이 있어요",
    needs: "필요한 것 — 사진 1장 이상",
    result: "결과 — 사진 순서를 바탕으로 작업 과정을 따라가는 글",
    icon: ImageIcon,
  },
  {
    route: "topic",
    label: "주제만 정해서",
    subtitle: "사진 없이 글부터",
    needs: "필요한 것 — 주제 한 줄",
    result: "결과 — 주제를 설명하는 글, 이미지는 자동으로 채워집니다",
    icon: Sparkles,
  },
  {
    route: "reference",
    label: "이 글처럼",
    subtitle: "참고할 글 주소가 있어요",
    needs: "필요한 것 — 참고할 블로그 글 주소",
    result: "결과 — 그 글과 같은 구성으로, 내 이야기를 담은 글",
    icon: LinkIcon,
  },
];

export default async function ThreeWayStartPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [postCount, lastPost] = await Promise.all([
    prisma.post.count({ where: { brand: { userId } } }),
    prisma.post.findFirst({
      where: { brand: { userId } },
      orderBy: { createdAt: "desc" },
      select: { mode: true, referenceUrl: true },
    }),
  ]);

  if (postCount >= SKIP_AFTER_POST_COUNT) {
    redirect("/dashboard");
  }

  const lastRoute: "photo" | "topic" | "reference" | null = lastPost
    ? lastPost.referenceUrl
      ? "reference"
      : lastPost.mode === "topic"
        ? "topic"
        : "photo"
    : null;
  const lastCard = CARDS.find((c) => c.route === lastRoute);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[720px] flex-col gap-6 px-6 py-14">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold tracking-[-.025em] text-[var(--foreground)]">
          어떤 재료로 시작할까요?
        </h1>
        <p className="text-[14.5px] text-[var(--muted)]">
          가진 것에 따라 셋 중 하나를 고르면, 그 방식만 자세히 물어봅니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.route}
              href={`/dashboard?route=${card.route}`}
              className="flex flex-col gap-3 rounded-[16px] border border-[var(--border-strong)] bg-white p-5 shadow-[0_2px_10px_rgba(22,22,26,.05)] transition-colors hover:border-[var(--accent)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="h-[20px] w-[20px]" strokeWidth={1.8} />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold text-[var(--foreground)]">{card.label}</span>
                <span className="text-[12.5px] text-[var(--hint)]">{card.subtitle}</span>
              </div>
              <div className="mt-auto flex flex-col gap-1 border-t border-[#F0F0F3] pt-3">
                <span className="text-[11.5px] leading-[1.5] text-[var(--muted)]">{card.needs}</span>
                <span className="text-[11.5px] leading-[1.5] text-[var(--faint)]">{card.result}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {lastCard ? (
        <Link
          href={`/dashboard?route=${lastCard.route}`}
          className="flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[13px] text-[var(--muted)] hover:border-[var(--border-strong)]"
        >
          지난번엔 <strong className="font-semibold text-[var(--foreground)]">{lastCard.label}</strong>{" "}
          쓰셨습니다
          <span className="ml-auto shrink-0 font-semibold text-[var(--accent)]">같은 방식으로 바로 시작 →</span>
        </Link>
      ) : null}
    </main>
  );
}
