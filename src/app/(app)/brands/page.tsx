import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function BrandsPage() {
  const session = await auth();
  const brands = await prisma.brand.findMany({
    where: { userId: session!.user!.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      styleProfile: { select: { version: true, updatedAt: true } },
      _count: { select: { sourcePosts: true, posts: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">테마 등록</h1>
          <p className="mt-2 text-sm text-zinc-600">
            테마를 만들고 샘플 원문으로 문체를 학습합니다. 학습이 끝나면 새 글에서 글을 만들 수 있습니다.
          </p>
        </div>
        <Link href="/brands/new">
          <Button>새 테마</Button>
        </Link>
      </div>

      {brands.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center">
          <p className="text-sm text-zinc-600">아직 등록된 테마가 없습니다.</p>
          <Link href="/brands/new" className="mt-4 inline-block">
            <Button>테마 만들기</Button>
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {brands.map((brand) => (
            <li key={brand.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/brands/${brand.id}`}
                    className="text-base font-medium text-zinc-900 hover:underline"
                  >
                    {brand.name}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span>원문 {brand._count.sourcePosts}</span>
                    <span>글 {brand._count.posts}</span>
                    {brand.styleProfile ? (
                      <Badge>학습 완료 v{brand.styleProfile.version}</Badge>
                    ) : (
                      <Badge className="border-amber-200 bg-amber-50 text-amber-800">미학습</Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/brands/${brand.id}`}>
                    <Button type="button" size="sm" variant="outline">
                      샘플 학습
                    </Button>
                  </Link>
                  {brand.styleProfile ? (
                    <Link href={`/posts/new?brandId=${brand.id}`}>
                      <Button type="button" size="sm">
                        새 글
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
