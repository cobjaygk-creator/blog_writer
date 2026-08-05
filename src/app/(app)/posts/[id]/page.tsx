import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PostWorkspace } from "@/components/PostWorkspace";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTraitsJson } from "@/lib/style-traits";

type Props = { params: Promise<{ id: string }> };

export default async function PostDetailPage({ params }: Props) {
  const session = await auth();
  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, brand: { userId: session!.user!.id } },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      drafts: { orderBy: { createdAt: "asc" } },
      brand: {
        select: {
          id: true,
          name: true,
          styleProfile: { select: { traitsJson: true } },
          templates: {
            orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
            select: { id: true, name: true, kind: true, html: true },
          },
        },
      },
    },
  });

  if (!post) notFound();

  const brandTone = post.brand.styleProfile
    ? normalizeTraitsJson(post.brand.styleProfile.traitsJson).tone
    : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex flex-wrap gap-3 text-sm text-[color:var(--muted)]">
        <Link href="/posts" className="hover:text-[var(--accent)]">
          ← 글 목록
        </Link>
        <Link href="/dashboard" className="hover:text-[var(--accent)]">
          대시보드
        </Link>
        <Link href={`/brands/${post.brand.id}`} className="hover:text-[var(--accent)]">
          {post.brand.name} 학습
        </Link>
        <Link href={`/brands/${post.brand.id}/templates`} className="hover:text-[var(--accent)]">
          템플릿
        </Link>
      </div>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-[color:var(--muted)]">편집기 준비 중…</p>}>
          <PostWorkspace
            initialPost={{
              id: post.id,
              brandId: post.brandId,
              mode: post.mode,
              title: post.title,
              titleCandidates: post.titleCandidates,
              body: post.body,
              keyword: post.keyword,
              productHighlights: post.productHighlights,
              captionTone: post.captionTone,
              status: post.status,
              headerTemplateId: post.headerTemplateId,
              footerTemplateId: post.footerTemplateId,
              images: post.images.map((img) => ({
                id: img.id,
                imageUrl: img.imageUrl,
                caption: img.caption,
                orderIndex: img.orderIndex,
                groupId: img.groupId,
              })),
              brand: { id: post.brand.id, name: post.brand.name },
              drafts: post.drafts.map((d, i) => ({
                id: d.id,
                provider: d.provider,
                modelId: d.modelId,
                title: d.title,
                titleCandidates: d.titleCandidates,
                body: d.body,
                isSelected: d.isSelected,
                label: i === 0 ? "버전 A" : "버전 B",
              })),
            }}
            templates={post.brand.templates}
            brandTone={brandTone}
          />
        </Suspense>
      </div>
    </main>
  );
}
