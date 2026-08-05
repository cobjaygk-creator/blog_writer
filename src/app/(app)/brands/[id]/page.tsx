import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandWorkspace } from "@/components/BrandWorkspace";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

export default async function BrandDetailPage({ params }: Props) {
  const session = await auth();
  const { id } = await params;
  const brand = await prisma.brand.findFirst({
    where: { id, userId: session!.user!.id },
    include: {
      sourcePosts: { orderBy: { createdAt: "desc" } },
      styleProfile: true,
      posts: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, title: true, status: true, keyword: true, createdAt: true },
      },
    },
  });

  if (!brand) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <Link href="/brands" className="text-sm text-[color:var(--muted)] hover:text-[var(--accent)]">
          ← 테마 등록
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[color:var(--foreground)]">
          {brand.name}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          네이버 블로그 일괄 가져오기 · 문체 학습
        </p>
        <div className="mt-8">
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
    </main>
  );
}
