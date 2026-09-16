"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, LayoutGrid, Plus, Search, Table as TableIcon } from "lucide-react";

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
  thumbnailUrl: string | null;
  chars: number;
};

type StatusFilter = "all" | "collecting" | "draft" | "published" | "archived";
type ViewMode = "table" | "board";

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

// 1c의 4열 보드를 그대로 씀 — "검수"는 별도 상태값이 없어(실제 파이프라인은
// collecting/draft/published/archived 4가지뿐) "보관"으로 대체했습니다.
const BOARD_COLUMNS: { status: StatusFilter; label: string; dot: string }[] = [
  { status: "collecting", label: "준비 중", dot: "#E0A93C" },
  { status: "draft", label: "초안", dot: "#0064FF" },
  { status: "published", label: "올림 완료", dot: "#0F7B52" },
  { status: "archived", label: "보관", dot: "#8A8A94" },
];

/** Stable per-voice color so the same 말투 always gets the same dot. */
const VOICE_PALETTE = ["#0064FF", "#0F7B52", "#8A6410", "#C2453C", "#6B5FD6", "#0F87A8"];
function voiceColor(brandId: string) {
  let hash = 0;
  for (let i = 0; i < brandId.length; i++) hash = (hash * 31 + brandId.charCodeAt(i)) >>> 0;
  return VOICE_PALETTE[hash % VOICE_PALETTE.length];
}

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

function Thumb({ url, size = 38 }: { url: string | null; size?: number }) {
  return (
    <span
      className="shrink-0 overflow-hidden rounded-[8px] bg-[#EDEDF1]"
      style={{ height: size, width: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
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

const COLS = "34px 1fr 116px 96px 96px 76px 40px";

export function PostsTable({
  posts,
  counts,
  brands,
  statusFilter,
  brandFilter,
  sort,
  total,
  view,
}: {
  posts: PostRow[];
  counts: Record<StatusFilter, number>;
  brands: { id: string; name: string }[];
  statusFilter: StatusFilter;
  brandFilter: string;
  sort: "recent" | "created";
  total: number;
  view: ViewMode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const voicePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!voicePickerOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (voicePickerRef.current && !voicePickerRef.current.contains(e.target as Node)) {
        setVoicePickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [voicePickerOpen]);

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
    const merged = { status: statusFilter, brandId: brandFilter, sort, view, ...next };
    if (merged.status && merged.status !== "all") params.set("status", merged.status);
    if (merged.brandId && merged.brandId !== "all") params.set("brandId", merged.brandId);
    if (merged.sort && merged.sort !== "recent") params.set("sort", merged.sort);
    if (merged.view && merged.view !== "table") params.set("view", merged.view);
    const qs = params.toString();
    router.push(qs ? `/posts?${qs}` : "/posts");
  }

  function setView(next: ViewMode) {
    // The board needs every status visible at once, so switching to it clears the status tab.
    applyParams({ view: next, status: next === "board" ? "all" : statusFilter });
  }

  async function patchStatus(id: string, status: string) {
    await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
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

  async function bulkSetVoice(newBrandId: string) {
    setBulkBusy(true);
    setVoicePickerOpen(false);
    try {
      await Promise.all(
        [...selected].map((id) =>
          fetch(`/api/posts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brandId: newBrandId }),
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
    <div className="flex flex-col">
      {/* 헤더 — 제목 · 개수 · 뷰 전환 · 새 글 */}
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-6">
        <span className="text-[14px] font-bold tracking-[-.015em] text-[var(--foreground)]">내 글</span>
        <span className="[font-variant-numeric:tabular-nums] text-[12px] text-[var(--hint)]">
          {total}개
        </span>
        <div className="flex-1" />
        <div className="flex gap-[2px] rounded-[9px] bg-[var(--surface-2)] p-[3px]">
          <button
            type="button"
            onClick={() => setView("table")}
            className={cn(
              "flex h-[26px] items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] font-semibold",
              view === "table" ? "bg-white text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,.07)]" : "text-[#8A8A94]",
            )}
          >
            <TableIcon className="h-3.5 w-3.5" strokeWidth={2} />표
          </button>
          <button
            type="button"
            onClick={() => setView("board")}
            className={cn(
              "flex h-[26px] items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] font-semibold",
              view === "board" ? "bg-white text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,.07)]" : "text-[#8A8A94]",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2} />보드
          </button>
        </div>
        <Link
          href="/posts/new"
          className="flex h-[30px] items-center gap-1 rounded-[9px] bg-[var(--accent)] px-3.5 text-[12.5px] font-semibold text-white shadow-[0_1px_3px_rgba(75,59,255,.4)] hover:bg-[var(--accent-hover)]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />새 글
        </Link>
      </div>

      {/* 필터 바 — 한 줄 */}
      <div className="flex h-[54px] shrink-0 items-center gap-[9px] border-b border-[var(--border)] bg-white px-6">
        {view === "table" ? (
          <div className="flex gap-[2px] rounded-[9px] border border-[#F0F0F3] bg-[#FBFBFC] p-[3px]">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyParams({ status: t.id })}
                className={cn(
                  "[font-variant-numeric:tabular-nums] flex h-[26px] items-center rounded-[7px] px-2.5 text-[11.5px] font-semibold",
                  statusFilter === t.id
                    ? "bg-[#16161A] text-white"
                    : "text-[#8A8A94]",
                )}
              >
                {t.label} {counts[t.id]}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[12px] font-semibold text-[var(--muted)]">
            보드는 전체 상태를 한번에 보여줍니다 · 카드를 끌어 옮기면 상태가 바뀝니다
          </span>
        )}

        <select
          value={brandFilter}
          onChange={(e) => applyParams({ brandId: e.target.value })}
          className="flex h-8 items-center rounded-[9px] border border-[var(--border-strong)] bg-white px-2.5 text-[12px] font-medium text-[#3A3A44]"
        >
          <option value="all">말투 전체</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {view === "table" ? (
          <>
            <div className="flex h-8 w-[240px] items-center gap-2 rounded-[9px] border border-[#E8E8EC] bg-[#FAFAFA] px-2.5">
              <Search className="h-[14px] w-[14px] shrink-0 text-[var(--hint)]" strokeWidth={2} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목 · 키워드 검색"
                className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[var(--foreground)] outline-none placeholder:text-[var(--hint)]"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => applyParams({ sort: e.target.value })}
              className="flex h-8 items-center rounded-[9px] border border-[var(--border-strong)] bg-white px-2.5 text-[12px] font-medium text-[#3A3A44]"
            >
              <option value="recent">최근 수정순</option>
              <option value="created">최근 생성순</option>
            </select>
          </>
        ) : null}
      </div>

      {view === "board" ? (
        <BoardView
          posts={filtered}
          dragId={dragId}
          setDragId={setDragId}
          onDrop={(id, status) => void patchStatus(id, status)}
        />
      ) : (
        <div className="relative px-6 pb-6 pt-4">
          <div className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--border)] bg-white">
            <div
              className="sticky top-0 z-10 grid h-9 shrink-0 items-center border-b border-[var(--border)] bg-[#FBFBFC] px-3.5 text-[10.5px] font-bold tracking-[.03em] text-[#9C9CA6]"
              style={{ gridTemplateColumns: COLS }}
            >
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                className="h-[15px] w-[15px] rounded-[4px] border-[1.5px] border-[#C6C6CE]"
              />
              <span>제목</span>
              <span>말투</span>
              <span>상태</span>
              <span>검수</span>
              <span className="text-right">수정</span>
              <span />
            </div>
            <div>
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-[var(--muted)]">
                  조건에 맞는 글이 없습니다.
                </p>
              ) : (
                filtered.map((post) => {
                  const isSelected = selected.has(post.id);
                  return (
                    <div
                      key={post.id}
                      className={cn(
                        "grid h-[58px] items-center border-b border-[#F4F4F6] px-3.5 last:border-b-0",
                        isSelected ? "bg-[#F7F6FF]" : "hover:bg-[var(--surface-2)]",
                      )}
                      style={{ gridTemplateColumns: COLS }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleOne(post.id)}
                        className={cn(
                          "flex h-[15px] w-[15px] items-center justify-center rounded-[4px]",
                          isSelected
                            ? "bg-[var(--accent)]"
                            : "border-[1.5px] border-[#D4D4DB] bg-transparent",
                        )}
                        aria-label="선택"
                      >
                        {isSelected ? <Check className="h-[11px] w-[11px] text-white" strokeWidth={3.4} /> : null}
                      </button>
                      <div className="flex min-w-0 items-center gap-[11px] pr-3.5">
                        <Thumb url={post.thumbnailUrl} />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <Link
                            href={`/posts/${post.id}`}
                            className="truncate text-[13px] font-semibold text-[var(--foreground)] hover:text-[var(--accent)]"
                          >
                            {post.title || post.keyword || "(제목 없음)"}
                          </Link>
                          <span className="[font-variant-numeric:tabular-nums] truncate text-[11px] text-[#9C9CA6]">
                            사진 {post.images} · {post.chars > 0 ? `${post.chars.toLocaleString()}자` : "초안 없음"}
                          </span>
                        </div>
                      </div>
                      <span className="flex items-center gap-[7px] pr-2.5 text-[11.5px] text-[#6B6B75]">
                        <span
                          className="h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{ background: voiceColor(post.brand.id) }}
                        />
                        <span className="truncate">{post.brand.name}</span>
                      </span>
                      <span>
                        <Badge variant={STATUS_TONE[post.status] ?? "neutral"}>
                          {postStatusLabel(post.status)}
                        </Badge>
                      </span>
                      <span className="text-[11.5px] text-[#C2C2CC]">—</span>
                      <span className="[font-variant-numeric:tabular-nums] text-right text-[11px] text-[#9C9CA6]">
                        {relativeTime(post.updatedAt)}
                      </span>
                      <RowMenu postId={post.id} status={post.status} onDone={() => router.refresh()} />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {selected.size > 0 ? (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-[13px] bg-[#16161A] px-[14px] py-[11px] pl-[18px] shadow-[0_12px_30px_rgba(22,22,26,.32)]">
              <span className="[font-variant-numeric:tabular-nums] text-[13px] font-semibold text-white">
                {selected.size}개 선택됨
              </span>
              <span className="h-5 w-px bg-[#3A3A44]" />
              <div ref={voicePickerRef} className="relative">
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => setVoicePickerOpen((v) => !v)}
                  className="flex h-[34px] items-center rounded-[9px] bg-[#2A2A34] px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  말투 바꾸기
                </button>
                {voicePickerOpen ? (
                  <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[168px] rounded-[9px] border border-[var(--border-strong)] bg-white p-1 shadow-[0_8px_24px_rgba(22,22,26,.14)]">
                    {brands.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => void bulkSetVoice(b.id)}
                        className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
                      >
                        <span
                          className="h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{ background: voiceColor(b.id) }}
                        />
                        {b.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkArchive()}
                className="flex h-[34px] items-center rounded-[9px] bg-[#2A2A34] px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
              >
                보관
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkDelete()}
                className="flex h-[34px] items-center rounded-[9px] bg-[#2A2A34] px-3.5 text-[12.5px] font-semibold text-[#F0A9A2] disabled:opacity-50"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="px-1 text-[15px] text-[#8A8A94] hover:text-white"
                aria-label="선택 취소"
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function BoardView({
  posts,
  dragId,
  setDragId,
  onDrop,
}: {
  posts: PostRow[];
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDrop: (id: string, status: string) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-4 gap-3 overflow-x-auto bg-[#F6F6F8] p-5">
      {BOARD_COLUMNS.map((col) => {
        const items = posts.filter((p) => p.status === col.status);
        return (
          <div key={col.status} className="flex min-h-0 min-w-[220px] flex-col gap-2">
            <div className="flex items-center gap-[7px] px-1">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col.dot }} />
              <span className="text-[12.5px] font-bold text-[var(--foreground)]">{col.label}</span>
              <span className="[font-variant-numeric:tabular-nums] text-[11.5px] text-[var(--hint)]">
                {items.length}
              </span>
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) onDrop(dragId, col.status);
                setDragId(null);
              }}
              className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto rounded-[12px] bg-[#F0F0F3] p-2"
            >
              {items.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  draggable
                  onDragStart={() => setDragId(post.id)}
                  onDragEnd={() => setDragId(null)}
                  className={cn(
                    "flex cursor-grab flex-col gap-2 rounded-[10px] border bg-white p-[11px_12px] active:cursor-grabbing",
                    dragId === post.id ? "opacity-50" : "border-[#E8E8EC] hover:border-[var(--border-strong)]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Thumb url={post.thumbnailUrl} size={28} />
                    <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] font-semibold leading-[1.45] text-[var(--foreground)]">
                      {post.title || post.keyword || "(제목 없음)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-[6px]">
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ background: voiceColor(post.brand.id) }}
                    />
                    <span className="truncate text-[11px] text-[#8A8A94]">{post.brand.name}</span>
                    <span className="[font-variant-numeric:tabular-nums] ml-auto shrink-0 text-[11px] text-[var(--hint)]">
                      사진 {post.images}
                    </span>
                  </div>
                </Link>
              ))}
              {col.status === "collecting" ? (
                <Link
                  href="/posts/new"
                  className="flex items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#D4D4DB] p-2.5 text-[12px] font-semibold text-[#8A8A94] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                  추가
                </Link>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
