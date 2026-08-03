import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { PostWorkspace } from "@/components/PostWorkspace";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

export default async function PostDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, brand: { userId: session.user.id } },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      brand: { select: { id: true, name: true } },
    },
  });

  if (!post) notFound();

  return (
    <>
      <AppNav email={session.user.email} />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <Link href={`/brands/${post.brand.id}`} className="text-sm text-zinc-500 hover:text-zinc-800">
          ← {post.brand.name}
        </Link>
        <div className="mt-6">
          <PostWorkspace
            initialPost={{
              id: post.id,
              brandId: post.brandId,
              title: post.title,
              titleCandidates: post.titleCandidates,
              body: post.body,
              keyword: post.keyword,
              status: post.status,
              images: post.images.map((img) => ({
                id: img.id,
                imageUrl: img.imageUrl,
                caption: img.caption,
                orderIndex: img.orderIndex,
              })),
              brand: post.brand,
            }}
          />
        </div>
      </main>
    </>
  );
}
