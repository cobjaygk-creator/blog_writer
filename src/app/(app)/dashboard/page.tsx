import Link from "next/link";

import { NewCutLink } from "@/components/NewCutLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { getPlanLimits, isUnlimitedEmail, normalizePlan } from "@/lib/plans";
import { postStatusLabel } from "@/lib/post-status";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id;

  let brands: {
    id: string;
    name: string;
    createdAt: Date;
    styleProfile: { version: number } | null;
    _count: { sourcePosts: number; posts: number };
  }[] = [];
  let posts: { id: string; title: string | null; status: string; createdAt: Date }[] = [];
  let dbError: string | null = null;

  try {
    brands = await prisma.brand.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        styleProfile: { select: { version: true } },
        _count: { select: { sourcePosts: true, posts: true } },
      },
    });
    posts = await prisma.post.findMany({
      where: { brand: { userId } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, status: true, createdAt: true },
    });
  } catch {
    dbError = "DB에 연결하지 못했습니다. DATABASE_URL과 prisma migrate를 확인해 주세요.";
  }

  const plan = normalizePlan(session!.user!.plan);
  const unlimited = isUnlimitedEmail(session!.user!.email);
  const limits = getPlanLimits(plan, session!.user!.email);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">Ditodio</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[color:var(--foreground)]">
            대시보드
          </h1>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            {session!.user!.email}
            <span className="mx-2 text-[var(--border)]">·</span>
            <span className="font-medium uppercase tracking-wide text-[var(--accent)]">
              {unlimited ? "unlimited" : plan}
            </span>
            <span className="ml-2">
              {unlimited
                ? "사용한도 무제한"
                : `테마 ${limits.brands} · 원문/테마 ${limits.sourcePostsPerBrand} · 이미지/글 ${limits.imagesPerPost}`}
            </span>
          </p>
        </div>
        <NewCutLink>
          <Button type="button" variant="outline" size="sm">
            New Cut 쇼츠
          </Button>
        </NewCutLink>
      </div>

      {dbError ? (
        <p className="mt-8 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {dbError}
        </p>
      ) : null}

      <section className="mt-10 grid gap-3 sm:grid-cols-2">
        <Link
          href="/brands"
          className="rounded-xl border border-[var(--border)] bg-white px-5 py-5 transition hover:border-[var(--accent)] hover:shadow-[0_8px_24px_rgba(94,86,240,0.08)]"
        >
          <h2 className="text-lg font-semibold text-[color:var(--foreground)]">테마 등록</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">테마 추가 · 샘플 원문 · 문체 학습</p>
        </Link>
        <Link
          href="/posts/new"
          className="rounded-xl border border-[var(--border)] bg-white px-5 py-5 transition hover:border-[var(--accent)] hover:shadow-[0_8px_24px_rgba(94,86,240,0.08)]"
        >
          <h2 className="text-lg font-semibold text-[color:var(--foreground)]">새 글</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">테마·톤을 고른 뒤 초안 만들기</p>
        </Link>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--foreground)]">테마</h2>
          <Link href="/brands">
            <Button size="sm" variant="outline">
              전체 보기
            </Button>
          </Link>
        </div>
        {brands.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-8 text-sm text-[color:var(--muted)]">
            등록된 테마가 없습니다. 테마 등록에서 만들고 샘플로 문체를 학습하세요.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {brands.map((brand) => (
              <li
                key={brand.id}
                className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 transition hover:border-[var(--accent)]"
              >
                <Link
                  href={`/brands/${brand.id}`}
                  className="font-semibold text-[color:var(--foreground)] hover:text-[var(--accent)]"
                >
                  {brand.name}
                </Link>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
                  <span>원문 {brand._count.sourcePosts}</span>
                  <span>글 {brand._count.posts}</span>
                  {brand.styleProfile ? (
                    <Badge>스타일 v{brand.styleProfile.version}</Badge>
                  ) : (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-800">미학습</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--foreground)]">최근 글</h2>
          <div className="flex gap-2">
            <Link href="/posts">
              <Button size="sm" variant="outline">
                전체 보기
              </Button>
            </Link>
            <Link href="/posts/new">
              <Button size="sm">새 글</Button>
            </Link>
          </div>
        </div>
        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-[color:var(--muted)]">아직 생성된 글이 없습니다.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-white">
            {posts.map((post) => (
              <li key={post.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link
                  href={`/posts/${post.id}`}
                  className="font-medium text-[color:var(--foreground)] hover:text-[var(--accent)]"
                >
                  {post.title || "(제목 없음)"}
                </Link>
                <Badge>{postStatusLabel(post.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
