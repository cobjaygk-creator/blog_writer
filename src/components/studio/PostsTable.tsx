"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { postStatusLabel } from "@/lib/post-status";
import { cn } from "@/lib/utils";

export type PostRow = {
  id: string;
  title: string | null;
  keyword: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  brand: { id: string; name: string };
  images: number;
  chars: number;
};

type StatusFilter = "all" | "collecting" | "draft" | "published" | "archived";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "collecting", label: "준비 중" },
  { id: "draft", label: "초안" },
  { id: "published", label: "올림 완료" },
  { id: "archived", label: "보관" },
];

const STATUS_TONE: Record<string, BadgeTone> = {
  published: "success",
  collecting: "warning",
  draft: "accent",
  archived: "neutral",
};

function relativeTime(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return `${Math.floor(day / 7)}주 전`;
}

function RowMenu({ postId, status, onDone }: { postId: string; status: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function archive() {
    setBusy(true);
    try {
      await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status === "archived" ? "draft" : "archived" }),
      });
      onDone();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function remove() {
    if (!window.confirm("이 글을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setBusy(true);
    try {
      await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      onDone();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[14px] font-bold text-[#C2C2CC] hover:bg-[var(--background)] hover:text-[var(--muted)]"
      >
        ···
      </button>
      {open ? (
        <div className="absolute right-0 top-7 z-20 w-[140px] rounded-[9px] border border-[var(--border-strong)] bg-white p-1 shadow-[0_8px_24px_rgba(22,22,26,.14)]">
          <button
            type="button"
            disabled={busy}
            onClick={() => void archive()}
            className="flex w-full items-center rounded-[7px] px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--background)] disabled:opacity-50"
          >
            {status === "archived" ? "보관 해제" : "보관"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="flex w-full items-center rounded-[7px] px-2.5 py-1.5 text-left text-[12px] font-medium text-[#C2453C] hover:bg-[#F7E7E5] disabled:opacity-50"
          >
            삭제
          </button>
        </div>
      ) : null}
    </div>
  );
}

const COLS = "34px 1fr 118px 96px 62px 74px 96px 40px";

export function PostsTable({
  posts,
  counts,
  brands,
  statusFilter,
  brandFilter,
  sort,
  total,
}: {
  posts: PostRow[];
  counts: Record<StatusFilter, number>;
  brands: { id: string; name: string }[];
  statusFilter: StatusFilter;
  brandFilter: string;
  sort: "recent" | "created";
  total: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const filtered = query.trim()
    ? posts.filter((p) => {
        const q = query.trim().toLowerCase();
        return (p.title ?? "").toLowerCase().includes(q) || (p.keyword ?? "").toLowerCase().includes(q);
      })
    : posts;

  const allChecked = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(filtered.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyParams(next: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { status: statusFilter, brandId: brandFilter, sort, ...next };
    if (merged.status && merged.status !== "all") params.set("status", merged.status);
    if (merged.brandId && merged.brandId !== "all") params.set("brandId", merged.brandId);
    if (merged.sort && merged.sort !== "recent") params.set("sort", merged.sort);
    const qs = params.toString();
    router.push(qs ? `/posts?${qs}` : "/posts");
  }

  async function bulkArchive() {
    setBulkBusy(true);
    try {
      await Promise.all(
        [...selected].map((id) =>
          fetch(`/api/posts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "archived" }),
          }),
        ),
      );
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!window.confirm(`선택한 ${selected.size}개 글을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selected].map((id) => fetch(`/api/posts/${id}`, { method: "DELETE" })));
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border)] px-6">
        <span className="[font-variant-numeric:tabular-nums] text-[11.5px] text-[var(--faint)]">
          {total}개
        </span>
        <div className="ml-auto flex h-[30px] items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[#FAFAFA] px-2.5 w-[220px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목 · 키워드 검색 (현재 목록 안에서)"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[var(--foreground)] outline-none placeholder:text-[var(--faint)]"
          />
        </div>
        <Link
          href="/posts/new"
          className="flex h-[30px] items-center rounded-[8px] bg-[var(--accent)] px-3.5 text-[12px] font-semibold text-white shadow-[0_1px_2px_rgba(75,59,255,.4)] hover:bg-[var(--accent-hover)]"
        >
          새 글
        </Link>
      </div>

      <div className="flex h-[46px] shrink-0 flex-wrap items-center gap-2 px-6">
        <div className="flex gap-[2px] rounded-[8px] bg-[var(--surface-2)] p-[3px]">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyParams({ status: t.id })}
              className={cn(
                "[font-variant-numeric:tabular-nums] flex h-6 items-center rounded-[6px] px-2.5 text-[11.5px] font-semibold",
                statusFilter === t.id
                  ? "bg-white text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                  : "text-[#8A8A94]",
              )}
            >
              {t.label} {counts[t.id]}
            </button>
          ))}
        </div>

        <select
          value={brandFilter}
          onChange={(e) => applyParams({ brandId: e.target.value })}
          className="h-7 rounded-[8px] border border-[var(--border-strong)] bg-white px-2 text-[11.5px] font-medium text-[#3A3A44]"
        >
          <option value="all">테마 전체</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => applyParams({ sort: e.target.value })}
          className="h-7 rounded-[8px] border border-[var(--border-strong)] bg-white px-2 text-[11.5px] font-medium text-[#3A3A44]"
        >
          <option value="recent">최근 수정순</option>
          <option value="created">최근 생성순</option>
        </select>

        <div className="flex-1" />

        {selected.size > 0 ? (
          <>
            <span className="[font-variant-numeric:tabular-nums] text-[11.5px] text-[var(--faint)]">
              {selected.size}개 선택됨
            </span>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void bulkArchive()}
              className="flex h-7 items-center rounded-[8px] border border-[var(--border-strong)] bg-white px-2.5 text-[11.5px] font-semibold text-[#3A3A44] disabled:opacity-50"
            >
              보관
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void bulkDelete()}
              className="flex h-7 items-center rounded-[8px] border border-[var(--border-strong)] bg-white px-2.5 text-[11.5px] font-semibold text-[#C2453C] disabled:opacity-50"
            >
              삭제
            </button>
          </>
        ) : null}
      </div>

      <div className="px-6 pb-6">
        <div className="flex flex-col overflow-hidden rounded-[11px] border border-[var(--border)] bg-white">
          <div
            className="sticky top-0 z-10 grid h-[34px] shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface-2)] px-3 text-[10.5px] font-bold tracking-[.03em] text-[var(--faint)]"
            style={{ gridTemplateColumns: COLS }}
          >
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="h-3.5 w-3.5 rounded-[4px] border-[#C6C6CE]"
            />
            <span>제목</span>
            <span>테마</span>
            <span>상태</span>
            <span className="text-right">사진</span>
            <span className="text-right">글자수</span>
            <span className="text-right">수정</span>
            <span />
          </div>
          <div>
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-[var(--muted)]">
                조건에 맞는 글이 없습니다.
              </p>
            ) : (
              filtered.map((post) => (
                <div
                  key={post.id}
                  className="grid h-[44px] items-center border-b border-[#F4F4F6] px-3 last:border-b-0 hover:bg-[var(--surface-2)]"
                  style={{ gridTemplateColumns: COLS }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(post.id)}
                    onChange={() => toggleOne(post.id)}
                    className="h-3.5 w-3.5 rounded-[4px] border-[#D4D4DB]"
                  />
                  <div className="flex min-w-0 items-center gap-2 pr-3.5">
                    <Link
                      href={`/posts/${post.id}`}
                      className="truncate text-[12.5px] font-semibold text-[var(--foreground)] hover:text-[var(--accent)]"
                    >
                      {post.title || "(제목 없음)"}
                    </Link>
                    {post.keyword ? (
                      <span className="shrink-0 truncate text-[10.5px] text-[var(--hint)]">
                        {post.keyword}
                      </span>
                    ) : null}
                  </div>
                  <span className="truncate pr-2.5 text-[11.5px] text-[var(--muted)]">
                    {post.brand.name}
                  </span>
                  <span>
                    <Badge variant={STATUS_TONE[post.status] ?? "neutral"}>
                      {postStatusLabel(post.status)}
                    </Badge>
                  </span>
                  <span className="[font-variant-numeric:tabular-nums] text-right text-[11.5px] text-[var(--muted)]">
                    {post.images}
                  </span>
                  <span className="[font-variant-numeric:tabular-nums] text-right text-[11.5px] text-[var(--muted)]">
                    {post.chars}
                  </span>
                  <span className="[font-variant-numeric:tabular-nums] text-right text-[11px] text-[var(--faint)]">
                    {relativeTime(post.updatedAt)}
                  </span>
                  <RowMenu postId={post.id} status={post.status} onDone={() => router.refresh()} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
