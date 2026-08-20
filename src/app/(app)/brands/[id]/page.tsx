import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandWorkspace } from "@/components/BrandWorkspace";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export default async function BrandDetailPage({ params }: Props) {
  const session = await auth();
  const userId = session!.user!.id;
  const { id } = await params;

  const [brand, siblingBrands] = await Promise.all([
    prisma.brand.findFirst({
      where: { id, userId },
      include: {
        sourcePosts: { orderBy: { createdAt: "desc" } },
        styleProfile: true,
        posts: {
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, title: true, status: true, keyword: true, createdAt: true },
        },
      },
    }),
    prisma.brand.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        styleProfile: { select: { version: true } },
        _count: { select: { sourcePosts: true, posts: true } },
      },
    }),
  ]);

  if (!brand) notFound();

  return (
    <div className="grid grid-cols-[236px_1fr] items-start">
      <aside className="sticky top-0 flex h-[100dvh] flex-col border-r border-[var(--border)] bg-white">
        <div className="flex h-[52px] shrink-0 items-center border-b border-[var(--border)] px-[15px]">
          <span className="text-[13.5px] font-bold text-[var(--foreground)]">테마</span>
          <Link
            href="/brands/new"
            className="ml-auto flex h-6 items-center rounded-[7px] border border-[var(--border-strong)] px-2.5 text-[11.5px] font-semibold text-[#3A3A44] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            + 추가
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {siblingBrands.map((b) => {
            const active = b.id === id;
            return (
              <Link
                key={b.id}
                href={`/brands/${b.id}`}
                className={cn(
                  "flex flex-col gap-0.5 rounded-[9px] px-[11px] py-[10px]",
                  active ? "bg-[#EFEDFF] border border-[#DCD7FF]" : "border border-transparent hover:bg-[var(--surface-2)]",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-semibold text-[var(--foreground)]">
                    {b.name}
                  </span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 text-[10px] font-bold",
                      b.styleProfile ? "text-[var(--faint)]" : "text-[#8A6410]",
                    )}
                  >
                    {b.styleProfile ? `v${b.styleProfile.version}` : "미학습"}
                  </span>
                </div>
                <span className="[font-variant-numeric:tabular-nums] text-[10.5px] text-[var(--faint)]">
                  원문 {b._count.sourcePosts} · 글 {b._count.posts}
                </span>
              </Link>
            );
          })}
        </div>
      </aside>

      <BrandWorkspace
        brandId={brand.id}
        brandName={brand.name}
        initialSources={brand.sourcePosts.map((s) => ({
          id: s.id,
          rawText: s.rawText,
          sourceUrl: s.sourceUrl,
          title: s.title,
          createdAt: s.createdAt.toISOString(),
        }))}
        initialStyle={
          brand.styleProfile
            ? {
                id: brand.styleProfile.id,
                summaryText: brand.styleProfile.summaryText,
                sampleAnchors: brand.styleProfile.sampleAnchors,
                traitsJson: brand.styleProfile.traitsJson,
                rawTraitsJson: brand.styleProfile.rawTraitsJson,
                version: brand.styleProfile.version,
                updatedAt: brand.styleProfile.updatedAt.toISOString(),
              }
            : null
        }
        initialPosts={brand.posts.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          keyword: p.keyword,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
