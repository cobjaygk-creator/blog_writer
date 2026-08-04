import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { postStatusLabel } from "@/lib/post-status";
import { prisma } from "@/lib/prisma";

export default async function PostsListPage() {
  const session = await auth();
  const userId = session!.user!.id;

  let posts: Array<{
    id: string;
    title: string | null;
    keyword: string | null;
    status: string;
    createdAt: Date;
    brand: { name: string };
  }> = [];
  let dbError: string | null = null;

  try {
    posts = await prisma.post.findMany({
      where: { brand: { userId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        keyword: true,
        status: true,
        createdAt: true,
        brand: { select: { name: true } },
      },
    });
  } catch {
    dbError = "DB에 연결하지 못했습니다. DATABASE_URL과 prisma migrate를 확인해 주세요.";
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">글 목록</h1>
          <p className="mt-2 text-sm text-zinc-600">최근에 만든 글을 열고 이어서 편집하세요.</p>
        </div>
        <Link href="/posts/new">
          <Button>새 글</Button>
        </Link>
      </div>

      {dbError ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {dbError}
        </p>
      ) : null}

      {posts.length === 0 && !dbError ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center">
          <p className="text-sm text-zinc-600">아직 만든 글이 없습니다.</p>
          <Link href="/posts/new" className="mt-4 inline-block">
            <Button>새 글 만들기</Button>
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {posts.map((post) => (
            <li key={post.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/posts/${post.id}`} className="font-medium text-zinc-900 hover:underline">
                  {post.title || post.keyword || "(제목 없음)"}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {post.brand.name}
                  <span className="mx-1.5 text-zinc-300">·</span>
                  {post.createdAt.toLocaleString("ko-KR")}
                </p>
              </div>
              <Badge>{postStatusLabel(post.status)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
