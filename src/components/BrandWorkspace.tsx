"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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

function intensity(label: string) {
  if (/많음|자주|높음|길게|중장문/.test(label)) return 80;
  if (/중간|보통/.test(label)) return 55;
  if (/적음|낮음|짧|거의 없음|사용 안 함|없음/.test(label)) return 22;
  return 50;
}

function firstExcerpt(anchors: unknown): string | null {
  if (!Array.isArray(anchors)) return null;
  for (const a of anchors) {
    if (a && typeof a === "object" && "excerpt" in a) {
      const excerpt = (a as { excerpt?: unknown }).excerpt;
      if (typeof excerpt === "string" && excerpt.trim()) return excerpt.trim();
    }
  }
  return null;
}

export function BrandWorkspace({
  brandId,
  brandName,
  initialSources,
  initialStyle,
  initialPosts,
}: {
  brandId: string;
  brandName: string;
  initialSources: SourcePost[];
  initialStyle: StyleProfile;
  initialPosts: PostSummary[];
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
      setError(data.error || "스타일 학습 실패");
      return;
    }
    setStyle(data.styleProfile);
    router.refresh();
  }

  async function deleteBrand() {
    if (!confirm("테마를 삭제하면 원문·스타일·글이 모두 삭제됩니다. 계속할까요?")) return;
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
  const sampleQuote = style ? firstExcerpt(style.sampleAnchors) : null;
  const chips = traits?.domainTerms?.length ? traits.domainTerms : traits?.commonPhrases ?? [];
  const avgChars = sources.length
    ? Math.round(sources.reduce((sum, s) => sum + s.rawText.length, 0) / sources.length)
    : 0;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-[22px]">
        {editingName ? (
          <form onSubmit={renameBrand} className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
              className="h-7 rounded-[6px] border border-[var(--border-strong)] px-2 text-[14px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
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
              className="text-[14px] font-bold tracking-[-.015em] text-[var(--foreground)] hover:text-[var(--accent)]"
              title="이름 변경"
            >
              {name}
            </button>
            {style ? (
              <>
                <Badge variant="success">학습 완료 v{style.version}</Badge>
                <span className="text-[11.5px] text-[var(--faint)]">
                  마지막 학습 {new Date(style.updatedAt).toLocaleDateString("ko-KR")} · 원문{" "}
                  {sources.length}편
                </span>
              </>
            ) : (
              <Badge variant="warning">미학습</Badge>
            )}
          </>
        )}
        <div className="flex-1" />
        <Button type="button" size="sm" variant="outline" onClick={() => setShowSourceForm((v) => !v)}>
          {showSourceForm ? "원문 추가 닫기" : "원문 추가"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="dark"
          onClick={() => void learnStyle()}
          disabled={busy === "learn" || sources.length === 0}
        >
          {busy === "learn" ? "학습 중…" : style ? "다시 학습" : "문체 학습"}
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

      {showSourceForm ? (
        <div className="border-b border-[var(--border)] bg-white px-[22px] py-4">
          <div className="mb-3 flex gap-[2px] rounded-[8px] bg-[var(--surface-2)] p-[3px]" style={{ width: "fit-content" }}>
            {(
              [
                ["bulk", "블로그 일괄"],
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
                    ? "flex h-7 items-center rounded-[6px] bg-white px-3 text-[12px] font-semibold text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                    : "flex h-7 items-center rounded-[6px] px-3 text-[12px] font-medium text-[#8A8A94]"
                }
              >
                {label}
              </button>
            ))}
          </div>

          {sourceMode === "bulk" ? (
            <form onSubmit={bulkImport} className="space-y-3">
              <Label>
                <span>네이버 블로그 URL</span>
                <Input
                  type="url"
                  required
                  value={blogUrl}
                  onChange={(e) => setBlogUrl(e.target.value)}
                  placeholder="https://blog.naver.com/블로그ID"
                  disabled={busy === "bulk"}
                />
                <span className="block text-xs font-normal text-[color:var(--muted)]">
                  최신 공개글 최대 100개를 가져와 원문으로 저장하고, 말투·용어·제품·편집 습관을 심화
                  학습합니다. 본인 운영 블로그의 공개글만 사용해 주세요.
                </span>
              </Label>
              <Button type="submit" disabled={busy === "bulk" || !blogUrl.trim()}>
                {busy === "bulk"
                  ? importProgress?.status === "learning"
                    ? "문체 학습 중…"
                    : importProgress
                      ? `가져오는 중… ${importProgress.fetchedCount + importProgress.skippedCount + importProgress.failedCount}/${importProgress.targetCount}`
                      : "목록 수집 중…"
                  : "일괄 가져오기 + 학습"}
              </Button>
              {importProgress ? (
                <p className="text-xs text-[color:var(--muted)]">
                  성공 {importProgress.fetchedCount} · 중복/스킵 {importProgress.skippedCount} · 실패{" "}
                  {importProgress.failedCount}
                  {importProgress.status === "completed" ? " · 완료" : ""}
                </p>
              ) : null}
            </form>
          ) : (
            <form onSubmit={addSource} className="space-y-3">
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
                  <span>기존 블로그 글 (문체 학습용)</span>
                  <Textarea
                    rows={6}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="테마 톤이 잘 드러나는 글을 붙여넣으세요 (20자 이상)"
                  />
                </Label>
              )}
              <Button
                type="submit"
                disabled={
                  busy === "source" ||
                  (sourceMode === "url" ? !sourceUrl.trim() : rawText.trim().length < 20)
                }
              >
                {busy === "source" ? (sourceMode === "url" ? "가져오는 중…" : "등록 중…") : "원문 추가"}
              </Button>
            </form>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_320px] gap-4 p-[22px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-[11px] border border-[var(--border)] bg-white p-[17px_18px]">
            <div className="flex items-center">
              <span className="text-[12.5px] font-bold text-[var(--foreground)]">학습된 문체 규칙</span>
              <span className="ml-auto text-[11px] text-[var(--faint)]">체크를 끄면 생성에서 제외됩니다</span>
            </div>
            {!style ? (
              <p className="mt-3 text-[12px] text-[var(--muted)]">
                문체 학습이 끝나면 이 테마의 규칙이 여기에 표시됩니다.
              </p>
            ) : (
              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                {STYLE_RULE_KEYS.map((key) => {
                  const active = isRuleActive(style.traitsJson, key);
                  return (
                    <label
                      key={key}
                      className="flex items-start gap-2.5 rounded-[9px] border border-[#EFEFF2] bg-[#FBFBFC] p-[11px_12px]"
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={ruleBusy === key}
                        onChange={(e) => void toggleRule(key, e.target.checked)}
                        className="mt-0.5 h-[15px] w-[15px] shrink-0 rounded-[4px] border-[var(--border-strong)]"
                      />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[12px] font-semibold text-[var(--foreground)]">
                          {ruleTitle(key)}
                        </span>
                        <span className="text-[10.5px] leading-[1.5] text-[var(--faint)]">
                          {ruleDescription(key, style.traitsJson)}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col overflow-hidden rounded-[11px] border border-[var(--border)] bg-white">
            <div className="flex h-10 shrink-0 items-center border-b border-[var(--border)] px-4">
              <span className="text-[12.5px] font-bold text-[var(--foreground)]">학습 원문</span>
              <span className="[font-variant-numeric:tabular-nums] ml-auto text-[11px] text-[var(--faint)]">
                {sources.length}편{sources.length ? ` · 평균 ${avgChars.toLocaleString()}자` : ""}
              </span>
            </div>
            {sources.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-[var(--muted)]">
                등록된 원문이 없습니다.
              </p>
            ) : (
              sources.map((s) => (
                <div
                  key={s.id}
                  className="grid h-[46px] items-center gap-0 border-b border-[#F4F4F6] px-4 last:border-b-0 hover:bg-[var(--surface-2)]"
                  style={{ gridTemplateColumns: "1fr 96px 74px 62px 44px" }}
                >
                  <span className="truncate pr-2.5 text-[12.5px] font-semibold text-[var(--foreground)]">
                    {s.title || "(제목 없음)"}
                  </span>
                  <span className="truncate pr-2 text-[11px] text-[var(--faint)]">
                    {sourceLabel(s.sourceUrl)}
                  </span>
                  <span className="[font-variant-numeric:tabular-nums] text-right text-[11.5px] text-[var(--muted)]">
                    {s.rawText.length.toLocaleString()}
                  </span>
                  <span className="[font-variant-numeric:tabular-nums] text-right text-[11px] text-[var(--faint)]">
                    {shortDate(s.createdAt)}
                  </span>
                  <button
                    type="button"
                    disabled={busy === `del-${s.id}`}
                    onClick={() => void removeSource(s.id)}
                    className="justify-self-end text-[11px] font-medium text-[var(--faint)] hover:text-[#C2453C] disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="rounded-[11px] border border-[var(--border)] bg-white p-4">
            <span className="text-[12.5px] font-bold text-[var(--foreground)]">문체 지문</span>
            {!traits ? (
              <p className="mt-2 text-[12px] text-[var(--muted)]">학습 후 표시됩니다.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                {(
                  [
                    ["문장 길이", traits.sentenceLength],
                    ["이모지 사용", traits.emojiUsage],
                    ["줄바꿈 리듬", traits.lineBreakStyle],
                    ["강조 방식", traits.emphasisStyle],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-[5px]">
                    <div className="flex text-[11.5px]">
                      <span className="text-[var(--muted)]">{label}</span>
                      <span className="ml-auto max-w-[65%] truncate font-semibold text-[var(--foreground)]">
                        {value}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-[#EDEDF1]">
                      <div
                        className="h-full rounded-full bg-[var(--foreground)]"
                        style={{ width: `${intensity(value)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {sampleQuote ? (
            <div className="rounded-[11px] border border-[var(--border)] bg-white p-4">
              <span className="text-[12.5px] font-bold text-[var(--foreground)]">
                이 테마로 쓴 문장 예시
              </span>
              <p className="mt-2.5 rounded-[9px] border border-[#F0F0F3] bg-[#FBFBFC] p-3 text-[12.5px] leading-[1.8] text-[var(--muted)]">
                {sampleQuote}
              </p>
              {chips.length ? (
                <div className="mt-2.5 flex flex-wrap gap-[5px]">
                  {chips.slice(0, 8).map((c) => (
                    <span
                      key={c}
                      className="flex h-[21px] items-center rounded-[5px] bg-[var(--surface-2)] px-2 text-[10.5px] font-semibold text-[var(--muted)]"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-[22px] pb-[22px]">
        <div className="rounded-[11px] border border-[var(--border)] bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-[var(--foreground)]">
              이 테마로 만든 글
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
              테마 삭제
            </Button>
            {style ? (
              <Link href={`/posts/new?brandId=${brandId}`}>
                <Button type="button" size="sm">
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
            <p className="mt-3 text-[12px] text-[var(--muted)]">이 테마로 만든 글은 아직 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
