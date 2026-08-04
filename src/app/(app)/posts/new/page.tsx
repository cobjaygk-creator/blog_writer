import Link from "next/link";

import { PostWizard } from "@/components/PostWizard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTraitsJson } from "@/lib/style-traits";

type Props = { searchParams: Promise<{ brandId?: string }> };

export default async function NewPostPage({ searchParams }: Props) {
  const session = await auth();
  const { brandId } = await searchParams;
  const brands = await prisma.brand.findMany({
    where: { userId: session!.user!.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      styleProfile: { select: { version: true, traitsJson: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← 대시보드
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">새 글 만들기</h1>
      <p className="mt-2 text-sm text-zinc-600">
        글 종류를 고른 뒤 테마·톤을 설정하고 바로 초안을 만들 수 있습니다.
      </p>
      <div className="mt-8">
        <PostWizard
          initialBrandId={brandId || null}
          brands={brands.map((brand) => ({
            id: brand.id,
            name: brand.name,
            learned: Boolean(brand.styleProfile),
            brandTone: brand.styleProfile
              ? normalizeTraitsJson(brand.styleProfile.traitsJson).tone
              : null,
          }))}
        />
      </div>
    </main>
  );
}
