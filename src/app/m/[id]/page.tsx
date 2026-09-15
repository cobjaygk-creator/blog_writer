import Link from "next/link";
import { notFound } from "next/navigation";

import { MobilePublish } from "@/components/mobile/MobilePublish";
import { auth } from "@/lib/auth";
import { plainTextLength, toEditorHtml } from "@/lib/content";
import { prisma } from "@/lib/prisma";
import { relativeTime } from "@/lib/relative-time";

type Props = { params: Promise<{ id: string }> };

function titleCandidateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

export default async function MobilePostPage({ params }: Props) {
  const session = await auth();
  const { id } = await params;

  const post = await prisma.post.findFirst({
    where: { id, brand: { userId: session!.user!.id } },
    include: {
      images: { orderBy: { orderIndex: "asc" } },
      drafts: { orderBy: { createdAt: "asc" } },
      brand: { select: { id: true, name: true } },
    },
  });

  if (!post) notFound();

  const selectedDraft =
    post.drafts.find((d) => d.isSelected) ?? post.drafts[0] ?? null;
  const rawBody = post.body?.trim() || selectedDraft?.body?.trim() || "";
  const hasDraft = plainTextLength(rawBody) > 0;

  if (!hasDraft) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-white px-8 text-center">
        <p className="text-[15px] font-semibold text-[var(--foreground)]">
          아직 초안이 없습니다
        </p>
        <p className="text-[13px] text-[#8A8A94]">
          사진과 한 줄로 초안을 먼저 만들어 주세요.
        </p>
        <Link
          href={`/m/g/${post.id}`}
          className="flex h-12 items-center justify-center rounded-[13px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white"
        >
          초안 만들기
        </Link>
      </main>
    );
  }

  const title = post.title?.trim() || selectedDraft?.title?.trim() || "(제목 없음)";
  const altTitles = [
    ...titleCandidateList(post.titleCandidates),
    ...titleCandidateList(selectedDraft?.titleCandidates),
  ]
    .filter((t) => t !== title)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 3);

  const bodyHtml = toEditorHtml(
    rawBody,
    post.images.map((img) => ({ imageUrl: img.imageUrl, caption: img.caption })),
    post.images,
  );

  return (
    <MobilePublish
      postId={post.id}
      brandId={post.brand.id}
      initialTitle={title}
      altTitles={altTitles}
      bodyHtml={bodyHtml}
      updatedLabel={relativeTime(post.updatedAt)}
    />
  );
}
