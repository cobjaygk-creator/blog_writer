import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { PostWorkspace } from "@/components/PostWorkspace";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTraitsJson } from "@/lib/style-traits";

type Props = { params: Promise<{ id: string }> };

export default async function PostDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, brand: { userId: session.user.id } },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
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
    <>
      <AppNav email={session.user.email} />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="flex flex-wrap gap-3 text-sm text-zinc-500">
          <Link href="/posts/new" className="hover:text-zinc-800">
            ← 포스트 등록
          </Link>
          <Link href={`/brands/${post.brand.id}`} className="hover:text-zinc-800">
            {post.brand.name} 학습
          </Link>
          <Link href={`/brands/${post.brand.id}/templates`} className="hover:text-zinc-800">
            템플릿
          </Link>
        </div>
        <div className="mt-6">
          <PostWorkspace
            initialPost={{
              id: post.id,
              brandId: post.brandId,
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
            }}
            templates={post.brand.templates}
            brandTone={brandTone}
          />
        </div>
      </main>
    </>
  );
}
