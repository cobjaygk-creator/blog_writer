import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { BrandWorkspace } from "@/components/BrandWorkspace";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

export default async function BrandDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const brand = await prisma.brand.findFirst({
    where: { id, userId: session.user.id },
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
    <>
      <AppNav email={session.user.email} />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <Link href="/brands" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 업체 등록
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">{brand.name}</h1>
        <p className="mt-2 text-sm text-zinc-600">네이버 블로그 일괄 가져오기 · 문체 학습</p>
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
    </>
  );
}
