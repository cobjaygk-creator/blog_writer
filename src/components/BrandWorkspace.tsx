"use client";

import { ChevronLeft, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { NewCutLink } from "@/components/NewCutLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postStatusLabel } from "@/lib/post-status";
import {
  isRuleActive,
  ruleDescription,
  ruleTitle,
  STYLE_RULE_KEYS,
  type StyleRuleKey,
} from "@/lib/style-rules";
import { normalizeExtendedTraits } from "@/lib/style-traits";
import { cn } from "@/lib/utils";

type SourcePost = {
  id: string;
  rawText: string;
  sourceUrl?: string | null;
  title?: string | null;
  createdAt: string;
};
type ImportJob = {
  id: string;
  status: string;
  targetCount: number;
  listedCount: number;
  fetchedCount: number;
  skippedCount: number;
  failedCount: number;
  error?: string | null;
};
type StyleProfile = {
  id: string;
  summaryText: string;
  sampleAnchors: unknown;
  traitsJson: unknown;
  rawTraitsJson?: unknown;
  version: number;
  updatedAt: string;
} | null;
type PostSummary = {
  id: string;
  title: string | null;
  status: string;
  keyword: string | null;
  createdAt: string;
};

function sourceLabel(url?: string | null) {
  if (!url) return "직접 입력";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "직접 입력";
  }
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-[34px] shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-[var(--accent)]" : "bg-[#E0E0E6]",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-all",
          checked ? "right-0.5" : "left-0.5",
        )}
      />
    </button>
  );
}

export function BrandWorkspace({
  brandId,
  brandName,
  initialSources,
  initialStyle,
  initialPosts,
  styleMatch,
}: {
  brandId: string;
  brandName: string;
  initialSources: SourcePost[];
  initialStyle: StyleProfile;
  initialPosts: PostSummary[];
  styleMatch: { score: number; sampleCount: number } | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(brandName);
  const [editingName, setEditingName] = useState(false);
  const [sources, setSources] = useState(initialSources);
  const [style, setStyle] = useState(initialStyle);
  const [posts] = useState(initialPosts);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceMode, setSourceMode] = useState<"text" | "url" | "bulk">("bulk");
  const [rawText, setRawText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [importProgress, setImportProgress] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ruleBusy, setRuleBusy] = useState<StyleRuleKey | null>(null);
  const [sample, setSample] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);

  useEffect(() => {
    if (!style) return;
    let cancelled = false;
    void (async () => {
      setSampleBusy(true);
      setSample(null);
      try {
        const res = await fetch(`/api/brands/${brandId}/style/sample`, { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as { sentence?: string };
        if (!cancelled) setSample(data.sentence || null);
      } catch {
        if (!cancelled) setSample(null);
      } finally {
        if (!cancelled) setSampleBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style?.version]);

  async function renameBrand(event: FormEvent) {
    event.preventDefault();
    setBusy("rename");
    setError(null);
    const res = await fetch(`/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "이름 변경 실패");
      return;
    }
    setEditingName(false);
    router.refresh();
  }

  async function addSource(event: FormEvent) {
    event.preventDefault();
    setBusy("source");
    setError(null);
    const payload = sourceMode === "url" ? { url: sourceUrl.trim() } : { rawText: rawText.trim() };
    const res = await fetch(`/api/brands/${brandId}/source-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      sourcePost?: SourcePost;
    };
    setBusy(null);
    if (!res.ok || !data.sourcePost) {
      setError(data.error || "원문 등록 실패");
      return;
    }
    setSources((prev) => [data.sourcePost!, ...prev]);
    setRawText("");
    setSourceUrl("");
    router.refresh();
  }

  async function refreshSources() {
    const res = await fetch(`/api/brands/${brandId}/source-posts`);
    const data = (await res.json().catch(() => ({}))) as { sourcePosts?: SourcePost[] };
    if (res.ok && data.sourcePosts) setSources(data.sourcePosts);
  }

  async function bulkImport(event: FormEvent) {
    event.preventDefault();
    setBusy("bulk");
    setError(null);
    setImportProgress(null);

    const createRes = await fetch(`/api/brands/${brandId}/source-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blogUrl: blogUrl.trim(), autoLearn: true }),
    });
    const createData = (await createRes.json().catch(() => ({}))) as {
      error?: string;
      job?: ImportJob;
    };
    if (!createRes.ok || !createData.job) {
      setBusy(null);
      setError(createData.error || "블로그 일괄 가져오기 시작 실패");
      return;
    }

    let job = createData.job;
    setImportProgress(job);

    while (job.status === "fetching" || job.status === "learning" || job.status === "listing") {
      const tickRes = await fetch(`/api/brands/${brandId}/source-import/${job.id}/tick`, {
        method: "POST",
      });
      const tickData = (await tickRes.json().catch(() => ({}))) as {
        error?: string;
        job?: ImportJob;
      };
      if (!tickRes.ok || !tickData.job) {
        setBusy(null);
        setError(tickData.error || "가져오기 진행 중 오류");
        return;
      }
      job = tickData.job;
      setImportProgress(job);
      if (job.status === "fetching") {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    setBusy(null);
    if (job.error) setError(job.error);
    await refreshSources();

    const styleRes = await fetch(`/api/brands/${brandId}`);
    const styleData = (await styleRes.json().catch(() => ({}))) as {
      brand?: { styleProfile?: StyleProfile };
    };
    if (styleData.brand?.styleProfile) setStyle(styleData.brand.styleProfile);
    router.refresh();
  }

  async function removeSource(postId: string) {
    setBusy(`del-${postId}`);
    setError(null);
    const res = await fetch(`/api/brands/${brandId}/source-posts/${postId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "삭제 실패");
      return;
    }
    setSources((prev) => prev.filter((s) => s.id !== postId));
    router.refresh();
  }

  async function learnStyle() {
    setBusy("learn");
    setError(null);
    const res = await fetch(`/api/brands/${brandId}/style/learn`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      styleProfile?: StyleProfile;
    };
    setBusy(null);
    if (!res.ok || !data.styleProfile) {
      setError(data.error || "말투 학습 실패");
      return;
    }
    setStyle(data.styleProfile);
    router.refresh();
  }

  async function deleteBrand() {
    if (!confirm("말투를 삭제하면 원문·학습 결과·글이 모두 삭제됩니다. 계속할까요?")) return;
    setBusy("delete");
    const res = await fetch(`/api/brands/${brandId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "삭제 실패");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function toggleRule(key: StyleRuleKey, enabled: boolean) {
    setRuleBusy(key);
    const res = await fetch(`/api/brands/${brandId}/style`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleKey: key, enabled }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; styleProfile?: StyleProfile };
    setRuleBusy(null);
    if (!res.ok || !data.styleProfile) {
      setError(data.error || "규칙 변경 실패");
      return;
    }
    setStyle(data.styleProfile);
  }

  const traits = style ? normalizeExtendedTraits(style.traitsJson) : null;
  const chips = traits?.domainTerms?.length ? traits.domainTerms : traits?.commonPhrases ?? [];
  const avgChars = sources.length
    ? Math.round(sources.reduce((sum, s) => sum + s.rawText.length, 0) / sources.length)
    : 0;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-[18px]">
        <Link
          href="/brands"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#C2C2CC] hover:bg-[var(--background)] hover:text-[var(--muted)]"
          aria-label="말투 목록으로"
        >
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} />
        </Link>
        {editingName ? (
          <form onSubmit={renameBrand} className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
              className="h-7 rounded-[6px] border border-[var(--border-strong)] px-2 text-[15px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
            <Button type="submit" size="sm" disabled={busy === "rename"}>
              저장
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingName(false)}>
              취소
            </Button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-[15px] font-bold tracking-[-.015em] text-[var(--foreground)] hover:text-[var(--accent)]"
              title="이름 변경"
            >
              {name}
            </button>
            {style ? (
              <>
                <span className="flex h-5 items-center rounded-[5px] bg-[var(--accent-soft)] px-2 text-[10.5px] font-bold text-[var(--accent)]">
                  v{style.version} 학습됨
                </span>
                <span className="text-[11.5px] text-[var(--hint)]">
                  원문 {sources.length}편 · {new Date(style.updatedAt).toLocaleDateString("ko-KR")} 갱신
                </span>
              </>
            ) : (
              <Badge variant="warning">미학습</Badge>
            )}
          </>
        )}
        <div className="flex-1" />
        {style ? (
          <Link href={`/posts/new?brandId=${brandId}`}>
            <Button type="button" size="sm" variant="outline">
              이 말투로 새 글
            </Button>
          </Link>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={() => void learnStyle()}
          disabled={busy === "learn" || sources.length === 0}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          {busy === "learn" ? "학습 중…" : style ? "다시 학습" : "말투 학습"}
        </Button>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-2 border-b border-[#F7E7E5] bg-[#F7E7E5] px-[22px] py-2 text-[12px] text-[#C2453C]">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-semibold">
            닫기
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_372px] gap-4 p-[22px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* 예시 카드 — 실제 생성 결과 */}
          {style ? (
            <div className="rounded-[13px] border border-[var(--border)] bg-white p-[18px_20px]">
              <div className="flex items-center">
                <span className="text-[13.5px] font-bold text-[var(--foreground)]">
                  이 말투로 쓰면 이렇게 나옵니다
                </span>
                <span className="ml-auto text-[11.5px] text-[var(--hint)]">
                  원문 {sources.length}편에서 학습
                </span>
              </div>
              <p className="mt-2.5 text-[15px] leading-[1.75] text-[#3f3f46]">
                {sampleBusy ? "예시 문장을 쓰는 중…" : sample || "예시를 불러오지 못했습니다."}
              </p>
              {chips.length ? (
                <div className="mt-3 flex flex-wrap gap-[6px]">
                  {chips.slice(0, 8).map((c) => (
                    <span
                      key={c}
                      className="flex h-[26px] items-center rounded-[7px] bg-[#F0F0F3] px-2.5 text-[11.5px] font-semibold text-[#6B6B75]"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 원문 목록 카드 */}
          <div className="flex flex-col overflow-hidden rounded-[13px] border border-[var(--border)] bg-white">
            <div className="flex h-[46px] shrink-0 items-center px-4">
              <span className="text-[12.5px] font-bold text-[var(--foreground)]">학습에 쓴 원문</span>
              <span className="[font-variant-numeric:tabular-nums] ml-2 text-[11px] text-[var(--faint)]">
                {sources.length}편{sources.length ? ` · 평균 ${avgChars.toLocaleString()}자` : ""}
              </span>
              <div className="flex-1" />
              <Button type="button" size="sm" variant="dark" onClick={() => setShowSourceForm((v) => !v)}>
                {showSourceForm ? "닫기" : "원문 추가"}
              </Button>
            </div>

            {/* 일괄 가져오기 배너 — 강조 위치, 항상 노출 */}
            <div className="flex items-center gap-3 border-b border-t border-[#F0F0F3] bg-[#F7F6FF] px-4 py-[13px]">
              <Sparkles className="h-[17px] w-[17px] shrink-0 text-[var(--accent)]" strokeWidth={1.8} />
              <div className="flex min-w-0 flex-col">
                <span className="text-[12.5px] font-semibold text-[var(--accent)]">
                  블로그 주소만 넣으면 최대 100편을 한번에 가져옵니다
                </span>
                <span className="text-[11.5px] text-[#6B5FD6]">한 편씩 붙여넣지 않아도 됩니다.</span>
              </div>
              <form
                onSubmit={bulkImport}
                className="ml-auto flex shrink-0 items-center gap-1.5"
              >
                <input
                  type="url"
                  required
                  value={blogUrl}
                  onChange={(e) => setBlogUrl(e.target.value)}
                  placeholder="blog.naver.com/..."
                  disabled={busy === "bulk"}
                  className="h-[30px] w-[160px] rounded-[8px] border border-[#D9D4FF] bg-white px-2.5 text-[11.5px] outline-none placeholder:text-[var(--hint)] focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={busy === "bulk" || !blogUrl.trim()}
                  className="flex h-[30px] shrink-0 items-center rounded-[8px] bg-[var(--accent)] px-3 text-[11.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === "bulk"
                    ? importProgress?.status === "learning"
                      ? "학습 중…"
                      : importProgress
                        ? `가져오는 중 ${importProgress.fetchedCount + importProgress.skippedCount + importProgress.failedCount}/${importProgress.targetCount}`
                        : "수집 중…"
                    : "주소로 가져오기"}
                </button>
              </form>
            </div>

            {showSourceForm ? (
              <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5">
                <div className="mb-2.5 flex gap-[2px] rounded-[8px] bg-white p-[3px]" style={{ width: "fit-content" }}>
                  {(
                    [
                      ["url", "URL"],
                      ["text", "붙여넣기"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSourceMode(id)}
                      className={
                        sourceMode === id
                          ? "flex h-7 items-center rounded-[6px] bg-[var(--accent-soft)] px-3 text-[12px] font-semibold text-[var(--accent)]"
                          : "flex h-7 items-center rounded-[6px] px-3 text-[12px] font-medium text-[#8A8A94]"
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <form onSubmit={addSource} className="space-y-2.5">
                  {sourceMode === "url" ? (
                    <Label>
                      <span>블로그 글 URL</span>
                      <Input
                        type="url"
                        required
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                        placeholder="https://blog.naver.com/... 또는 일반 블로그 URL"
                      />
                    </Label>
                  ) : (
                    <Label>
                      <span>기존 블로그 글 (말투 학습용)</span>
                      <Textarea
                        rows={5}
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        placeholder="말투가 잘 드러나는 글을 붙여넣으세요 (20자 이상)"
                      />
                    </Label>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      busy === "source" ||
                      (sourceMode === "url" ? !sourceUrl.trim() : rawText.trim().length < 20)
                    }
                  >
                    {busy === "source" ? (sourceMode === "url" ? "가져오는 중…" : "등록 중…") : "원문 추가"}
                  </Button>
                </form>
              </div>
            ) : null}

            {sources.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-[var(--muted)]">
                등록된 원문이 없습니다.
              </p>
            ) : (
              sources.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 border-b border-[#F4F4F6] px-4 py-3 last:border-b-0 hover:bg-[var(--surface-2)]"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[12.5px] font-semibold text-[var(--foreground)]">
                      {s.title || "(제목 없음)"}
                    </span>
                    <span className="[font-variant-numeric:tabular-nums] truncate text-[11px] text-[#9C9CA6]">
                      {sourceLabel(s.sourceUrl)} · {s.rawText.length.toLocaleString()}자 · {shortDate(s.createdAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy === `del-${s.id}`}
                    onClick={() => void removeSource(s.id)}
                    className="shrink-0 text-[11px] font-medium text-[var(--faint)] hover:text-[#C2453C] disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 우측 패널 — 배운 것 중에 끌 것 */}
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <span className="text-[13.5px] font-bold text-[var(--foreground)]">배운 것 중에 끌 것</span>
            <span className="text-[11.5px] leading-[1.5] text-[#9C9CA6]">
              끄면 다음 글부터 그 특징을 쓰지 않습니다. 다시 켜도 학습을 새로 돌리지 않습니다.
            </span>
          </div>

          {!style ? (
            <p className="rounded-[11px] border border-[var(--border)] bg-white p-3.5 text-[12px] text-[var(--muted)]">
              말투 학습이 끝나면 여기서 특징을 켜고 끌 수 있습니다.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {STYLE_RULE_KEYS.map((key) => {
                const active = isRuleActive(style.traitsJson, key);
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-start gap-[11px] rounded-[11px] border border-[var(--border)] p-[12px_13px]",
                      active ? "bg-white" : "bg-[#FBFBFC]",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className={cn(
                          "text-[13px] font-semibold",
                          active ? "text-[var(--foreground)]" : "text-[#8A8A94]",
                        )}
                      >
                        {ruleTitle(key)}
                      </span>
                      <span
                        className={cn(
                          "text-[11.5px] leading-[1.5]",
                          active ? "text-[#9C9CA6]" : "text-[var(--hint)]",
                        )}
                      >
                        {ruleDescription(key, style.traitsJson)}
                      </span>
                    </div>
                    <Switch
                      checked={active}
                      disabled={ruleBusy === key}
                      onChange={(next) => void toggleRule(key, next)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {styleMatch ? (
            <div className="mt-auto rounded-[12px] border border-[#F0F0F3] bg-[#FBFBFC] p-[13px]">
              <span className="[font-variant-numeric:tabular-nums] text-[12px] font-bold text-[var(--foreground)]">
                말투 일치도 {styleMatch.score}점
              </span>
              <p className="mt-1 text-[11.5px] leading-[1.55] text-[#9C9CA6]">
                이 말투로 쓴 최근 {styleMatch.sampleCount}편 평균입니다. 원문을 더 넣으면 올라갑니다.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-[22px] pb-[22px]">
        <div className="rounded-[11px] border border-[var(--border)] bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-[var(--foreground)]">
              이 말투로 만든 글
            </span>
            <span className="text-[11px] text-[var(--faint)]">{posts.length}개</span>
            <div className="flex-1" />
            <Link href={`/brands/${brandId}/templates`} className="text-[11.5px] text-[var(--faint)] hover:text-[var(--accent)]">
              머리말·꼬리말 템플릿
            </Link>
            <NewCutLink brandId={brandId}>
              <span className="cursor-pointer text-[11.5px] text-[var(--faint)] hover:text-[var(--accent)]">
                New Cut 쇼츠
              </span>
            </NewCutLink>
            <Button type="button" size="sm" variant="danger" onClick={() => void deleteBrand()} disabled={busy === "delete"}>
              말투 삭제
            </Button>
            {!style ? (
              <Link href={`/posts/new?brandId=${brandId}`}>
                <Button type="button" size="sm">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                  새 글
                </Button>
              </Link>
            ) : null}
          </div>
          {posts.length > 0 ? (
            <div className="mt-3 divide-y divide-[var(--border)] rounded-[9px] border border-[var(--border)]">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="flex items-center justify-between px-3 py-2.5 text-[12.5px] hover:bg-[var(--surface-2)]"
                >
                  <span className="truncate font-medium text-[var(--foreground)]">
                    {post.title || post.keyword || "(제목 없음)"}
                  </span>
                  <Badge>{postStatusLabel(post.status)}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-[var(--muted)]">이 말투로 만든 글은 아직 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
