import { notFound, redirect } from "next/navigation";

import { MobileGenerating } from "@/components/mobile/MobileGenerating";
import { auth } from "@/lib/auth";
import { plainTextLength } from "@/lib/content";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kw?: string }>;
};

export default async function MobileGeneratePage({ params, searchParams }: Props) {
  const session = await auth();
  const { id } = await params;
  const { kw } = await searchParams;

  const post = await prisma.post.findFirst({
    where: { id, brand: { userId: session!.user!.id } },
    select: {
      keyword: true,
      body: true,
      status: true,
      brand: { select: { name: true } },
      _count: { select: { images: true, drafts: true } },
    },
  });

  if (!post) notFound();

  const hasDraft = post._count.drafts > 0 || plainTextLength(post.body) > 0;
  if (hasDraft && (post.status === "draft" || post.status === "published")) {
    redirect(`/m/${id}`);
  }

  return (
    <MobileGenerating
      postId={id}
      keyword={(kw || post.keyword || "").trim()}
      voiceName={post.brand.name}
      imageCount={post._count.images}
    />
  );
}
