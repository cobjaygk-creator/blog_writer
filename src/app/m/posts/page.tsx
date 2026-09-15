import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { plainTextLength } from "@/lib/content";
import { prisma } from "@/lib/prisma";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  collecting: { label: "준비 중", cls: "bg-[#F4EDD8] text-[#8A6410]" },
  draft: { label: "초안", cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  published: { label: "올림 완료", cls: "bg-[#E7F5EF] text-[#0F7B52]" },
  archived: { label: "보관", cls: "bg-[#F0F0F3] text-[#8A8A94]" },
};

export default async function MobilePostsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  let rows: {
    id: string;
    title: string;
    status: string;
    voiceName: string;
    images: number;
    hasBody: boolean;
    thumb: string | null;
    updatedAt: Date;
  }[] = [];
  let dbError = false;

  try {
    const posts = await prisma.post.findMany({
      where: { brand: { userId } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        title: true,
        keyword: true,
        status: true,
        body: true,
        updatedAt: true,
        brand: { select: { name: true } },
        images: { orderBy: { orderIndex: "asc" }, take: 1, select: { imageUrl: true } },
        _count: { select: { images: true } },
      },
    });
    rows = posts.map((p) => ({
      id: p.id,
      title: p.title || p.keyword || "(제목 없음)",
      status: p.status,
      voiceName: p.brand.name,
      images: p._count.images,
      hasBody: Boolean(p.body && plainTextLength(p.body) > 0),
      thumb: p.images[0]?.imageUrl ?? null,
      updatedAt: p.updatedAt,
    }));
  } catch {
    dbError = true;
  }

  function hrefFor(status: string, id: string) {
    return status === "collecting" ? `/m/g/${id}` : `/m/${id}`;
  }

  return (
    <main className="flex flex-1 flex-col bg-[#F6F6F8] pb-[92px]">
      <div className="flex h-[54px] items-center gap-2 border-b border-[#F0F0F3] bg-white px-5">
        <span className="text-[15px] font-bold text-[var(--foreground)]">내 글</span>
        {rows.length > 0 ? (
          <span className="flex h-[21px] items-center rounded-[6px] bg-[#F0F0F3] px-2 text-[11px] font-bold text-[var(--muted)] [font-variant-numeric:tabular-nums]">
            {rows.length}
          </span>
        ) : null}
        <Link
          href="/m/new"
          className="ml-auto flex h-8 items-center rounded-[9px] bg-[var(--accent)] px-3.5 text-[12.5px] font-semibold text-white"
        >
          새 글
        </Link>
      </div>

      {dbError ? (
        <p className="m-5 rounded-[12px] border border-[#F0DFB4] bg-[#FDF9EE] px-4 py-3 text-[13px] text-[#8A6410]">
          목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-[14px] text-[#8A8A94]">아직 만든 글이 없습니다.</p>
          <Link
            href="/m/new"
            className="flex h-12 items-center justify-center rounded-[13px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white"
          >
            첫 글 만들기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-4">
          {rows.map((row) => {
            const meta = STATUS_META[row.status] ?? STATUS_META.draft;
            return (
              <Link
                key={row.id}
                href={hrefFor(row.status, row.id)}
                className="flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-white p-3.5"
              >
                <span className="h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[10px] bg-[#E6E6EB]">
                  {row.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.thumb} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex h-[19px] shrink-0 items-center rounded-[5px] px-1.5 text-[10.5px] font-bold",
                        meta.cls,
                      )}
                    >
                      {meta.label}
                    </span>
                    <span className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                      {row.title}
                    </span>
                  </span>
                  <span className="truncate text-[12px] text-[#9C9CA6] [font-variant-numeric:tabular-nums]">
                    {row.voiceName} · 사진 {row.images} · {row.hasBody ? "초안 있음" : "초안 없음"} ·{" "}
                    {relativeTime(row.updatedAt)}
                  </span>
                </span>
                <ChevronRight className="h-[19px] w-[19px] shrink-0 text-[#C2C2CC]" strokeWidth={2} />
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
