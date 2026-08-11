import Link from "next/link";

import { PostWizard } from "@/components/PostWizard";
import { StudioQuickCreate } from "@/components/studio/StudioQuickCreate";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStudioUiEnabled } from "@/lib/studio-ui";
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

  const brandOptions = brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    learned: Boolean(brand.styleProfile),
    brandTone: brand.styleProfile
      ? normalizeTraitsJson(brand.styleProfile.traitsJson).tone
      : null,
  }));

  if (isStudioUiEnabled()) {
    return (
      <main>
        <StudioQuickCreate brands={brandOptions} initialBrandId={brandId || null} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-[color:var(--muted)] hover:text-[var(--accent)]"
      >
        ← 대시보드
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-[color:var(--foreground)]">
        새 글 만들기
      </h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        입력만 마치면 편집기로 넘어가 초안 생성·비교·문체 보정이 이어집니다.
      </p>
      <div className="mt-8">
        <PostWizard initialBrandId={brandId || null} brands={brandOptions} />
      </div>
    </main>
  );
}
