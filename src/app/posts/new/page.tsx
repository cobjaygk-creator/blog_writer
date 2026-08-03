import Link from "next/link";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { PostCreateForm } from "@/components/PostCreateForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTraitsJson } from "@/lib/style-traits";

type Props = { searchParams: Promise<{ brandId?: string }> };

export default async function NewPostPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { brandId } = await searchParams;
  const brands = await prisma.brand.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      styleProfile: { select: { version: true, traitsJson: true } },
    },
  });

  return (
    <>
      <AppNav email={session.user.email} />
      <main className="mx-auto w-full max-w-xl px-6 py-10">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 대시보드
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">포스트 등록</h1>
        <p className="mt-2 text-sm text-zinc-600">
          학습된 업체를 고르고 새 포스트를 만듭니다. 사진은 다음 화면에서 올리고 초안을 생성하세요.
        </p>
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>새 포스트</CardTitle>
          </CardHeader>
          <CardContent>
            <PostCreateForm
              initialBrandId={brandId || null}
              brands={brands.map((brand) => ({
                id: brand.id,
                name: brand.name,
                learned: Boolean(brand.styleProfile),
                styleVersion: brand.styleProfile?.version ?? null,
                brandTone: brand.styleProfile
                  ? normalizeTraitsJson(brand.styleProfile.traitsJson).tone
                  : null,
              }))}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
