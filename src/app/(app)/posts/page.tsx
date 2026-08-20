import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PostsTable, type PostRow } from "@/components/studio/PostsTable";
import { auth } from "@/lib/auth";
import { plainTextLength } from "@/lib/content";
import { prisma } from "@/lib/prisma";

const STATUS_IDS = ["collecting", "draft", "published", "archived"] as const;
type StatusFilter = "all" | (typeof STATUS_IDS)[number];

type Props = {
  searchParams: Promise<{ status?: string; brandId?: string; sort?: string }>;
};

export default async function PostsListPage({ searchParams }: Props) {
  const { status, brandId, sort } = await searchParams;
  const session = await auth();
  const userId = session!.user!.id;

  const statusFilter: StatusFilter = (STATUS_IDS as readonly string[]).includes(status ?? "")
    ? (status as StatusFilter)
    : "all";
  const brandFilter = brandId || "all";
  const sortKey = sort === "created" ? "created" : "recent";

  let posts: PostRow[] = [];
  const counts: Record<StatusFilter, number> = { all: 0, collecting: 0, draft: 0, published: 0, archived: 0 };
  let brands: { id: string; name: string }[] = [];
  let dbError: string | null = null;

  try {
    const [rows, groups, brandRows] = await Promise.all([
      prisma.post.findMany({
        where: {
          brand: { userId },
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(brandFilter !== "all" ? { brandId: brandFilter } : {}),
        },
        orderBy: sortKey === "created" ? { createdAt: "desc" } : { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          keyword: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          body: true,
          brand: { select: { id: true, name: true } },
          _count: { select: { images: true } },
        },
      }),
      prisma.post.groupBy({
        by: ["status"],
        where: { brand: { userId } },
        _count: true,
      }),
      prisma.brand.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    posts = rows.map((r) => ({
      id: r.id,
      title: r.title,
      keyword: r.keyword,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      brand: r.brand,
      images: r._count.images,
      chars: plainTextLength(r.body),
    }));
    brands = brandRows;

    for (const g of groups) {
      const key = g.status as StatusFilter;
      if (key in counts) counts[key] = g._count;
    }
    counts.all = STATUS_IDS.reduce((sum, id) => sum + counts[id], 0);
  } catch {
    dbError = "DB에 연결하지 못했습니다. DATABASE_URL과 prisma migrate를 확인해 주세요.";
  }

  if (dbError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="rounded-[8px] border border-[#F4EDD8] bg-[#F4EDD8] px-4 py-3 text-sm text-[#8A6410]">
          {dbError}
        </p>
      </main>
    );
  }

  if (counts.all === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
        <p className="text-sm text-[var(--muted)]">아직 만든 글이 없습니다.</p>
        <Link href="/posts/new" className="mt-4 inline-block">
          <Button>새 글 만들기</Button>
        </Link>
      </main>
    );
  }

  return (
    <div className="flex flex-col">
      <PostsTable
        posts={posts}
        counts={counts}
        brands={brands}
        statusFilter={statusFilter}
        brandFilter={brandFilter}
        sort={sortKey}
        total={counts.all}
      />
    </div>
  );
}
