import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  let brands: { id: string; name: string; createdAt: Date }[] = [];
  let posts: { id: string; title: string | null; status: string; createdAt: Date }[] = [];
  let dbError: string | null = null;

  try {
    brands = await prisma.brand.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true },
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

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">대시보드</h1>
          <p className="mt-1 text-sm text-zinc-600">{session.user.email}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            로그아웃
          </button>
        </form>
      </div>

      {dbError ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {dbError}
        </p>
      ) : null}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-zinc-900">업체</h2>
          <span className="text-xs text-zinc-500">2단계에서 생성 API 연결 예정</span>
        </div>
        {brands.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-sm text-zinc-500">
            등록된 업체가 없습니다. 다음 단계에서 업체·스타일 학습을 추가합니다.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {brands.map((brand) => (
              <li key={brand.id} className="rounded-xl border border-zinc-200 px-4 py-3">
                <Link href={`/brands/${brand.id}`} className="font-medium text-zinc-900 hover:underline">
                  {brand.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-zinc-900">최근 포스트</h2>
        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">아직 생성된 포스트가 없습니다.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {posts.map((post) => (
              <li key={post.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/posts/${post.id}`} className="font-medium text-zinc-900 hover:underline">
                  {post.title || "(제목 없음)"}
                </Link>
                <span className="text-zinc-500">{post.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
