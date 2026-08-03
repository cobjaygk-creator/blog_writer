import Link from "next/link";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth, signOut } from "@/lib/auth";
import { buildNewCutDeepLink } from "@/lib/newcut";
import { getPlanLimits, isUnlimitedEmail, normalizePlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

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
      where: { userId: session.user.id },
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
      where: { brand: { userId: session.user.id } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, status: true, createdAt: true },
    });
  } catch {
    dbError = "DB에 연결하지 못했습니다. DATABASE_URL과 prisma migrate를 확인해 주세요.";
  }

  const newCutUrl = buildNewCutDeepLink({ from: "blog_writer" });
  const plan = normalizePlan(session.user.plan);
  const unlimited = isUnlimitedEmail(session.user.email);
  const limits = getPlanLimits(plan, session.user.email);

  return (
    <>
      <AppNav email={session.user.email} />
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">대시보드</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {session.user.email}
              <span className="mx-2 text-zinc-300">·</span>
              <span className="uppercase tracking-wide">{unlimited ? "unlimited" : plan}</span>
              <span className="ml-2 text-zinc-500">
                {unlimited
                  ? "사용한도 무제한"
                  : `업체 ${limits.brands} · 원문/업체 ${limits.sourcePostsPerBrand} · 이미지/포스트 ${limits.imagesPerPost}`}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={newCutUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="outline" size="sm">
                New Cut 쇼츠
              </Button>
            </a>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                로그아웃
              </Button>
            </form>
          </div>
        </div>

        {dbError ? (
          <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {dbError}
          </p>
        ) : null}

        <section className="mt-10 grid gap-3 sm:grid-cols-2">
          <Link
            href="/brands"
            className="rounded-xl border border-zinc-200 bg-white px-5 py-5 transition hover:border-zinc-300"
          >
            <h2 className="text-lg font-medium text-zinc-900">업체 등록</h2>
            <p className="mt-2 text-sm text-zinc-600">업체 추가 · 샘플 원문 · 문체 학습</p>
          </Link>
          <Link
            href="/posts/new"
            className="rounded-xl border border-zinc-200 bg-white px-5 py-5 transition hover:border-zinc-300"
          >
            <h2 className="text-lg font-medium text-zinc-900">포스트 등록</h2>
            <p className="mt-2 text-sm text-zinc-600">학습된 업체로 새 글 만들기</p>
          </Link>
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-zinc-900">업체</h2>
            <Link href="/brands">
              <Button size="sm" variant="outline">
                전체 보기
              </Button>
            </Link>
          </div>
          {brands.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-sm text-zinc-500">
              등록된 업체가 없습니다. 업체 등록에서 만들고 샘플로 문체를 학습하세요.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {brands.map((brand) => (
                <li key={brand.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                  <Link href={`/brands/${brand.id}`} className="font-medium text-zinc-900 hover:underline">
                    {brand.name}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span>원문 {brand._count.sourcePosts}</span>
                    <span>포스트 {brand._count.posts}</span>
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
            <h2 className="text-lg font-medium text-zinc-900">최근 포스트</h2>
            <Link href="/posts/new">
              <Button size="sm">포스트 등록</Button>
            </Link>
          </div>
          {posts.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">아직 생성된 포스트가 없습니다.</p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
              {posts.map((post) => (
                <li key={post.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <Link href={`/posts/${post.id}`} className="font-medium text-zinc-900 hover:underline">
                    {post.title || "(제목 없음)"}
                  </Link>
                  <Badge>{post.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
