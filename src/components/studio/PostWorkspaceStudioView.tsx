"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { GenerationProgressModal } from "@/components/GenerationProgressModal";
import { ImageGalleryBoard } from "@/components/ImageGalleryBoard";
import { ImageUploadDropzone } from "@/components/ImageUploadDropzone";
import { NewCutLink } from "@/components/NewCutLink";
import { RichEditor } from "@/components/RichEditor";
import { LearnedSupplementPanel } from "@/components/studio/LearnedSupplementPanel";
import { PostFilmstrip } from "@/components/studio/PostFilmstrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BRAND_CAPTION_TONE } from "@/lib/caption-tones";
import {
  TOPIC_LENGTHS,
  TOPIC_LENGTH_PRESETS,
  type TopicLength,
} from "@/lib/topic-length";
import { cn } from "@/lib/utils";

type PostImage = {
  id: string;
  imageUrl: string;
  caption: string | null;
  orderIndex: number;
  groupId?: string | null;
};

type BrandTemplateOption = {
  id: string;
  name: string;
  kind: "header" | "footer" | string;
  html: string;
};

type CandidateDraft = {
  id: string;
  provider: string;
  title: string | null;
  body: string;
  label?: string;
};

type ToneOption = { value: string; label: string };

export type PostWorkspaceStudioViewProps = {
  post: {
    id: string;
    brandId: string;
    mode?: string | null;
    status: string;
    brand: { id: string; name: string };
    images: PostImage[];
  };
  keyword: string;
  setKeyword: (v: string) => void;
  captionTone: string;
  setCaptionTone: (v: string) => void;
  draftLength: TopicLength;
  setDraftLength: (v: TopicLength) => void;
  topicImageCount: number;
  setTopicImageCount: (v: number) => void;
  topicUseAiImages: boolean;
  setTopicUseAiImages: (v: boolean) => void;
  topicReplaceImages: boolean;
  setTopicReplaceImages: (v: boolean) => void;
  productHighlights: string;
  setProductHighlights: (v: string) => void;
  useLearnedSupplement: boolean;
  setUseLearnedSupplement: (v: boolean) => void;
  excludedSupplementPoints: string[];
  setExcludedSupplementPoints: (v: string[]) => void;
  toneOptions: ToneOption[];
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  titleCandidates: string[];
  editorTab: "edit" | "preview";
  setEditorTab: (v: "edit" | "preview") => void;
  editorRevision: number;
  busy: string | null;
  error: string | null;
  setError: (v: string | null) => void;
  statusLabel: string;
  statusHint: string;
  bodyLocked: boolean;
  canCopy: boolean;
  needsSelection: boolean;
  candidateDrafts: CandidateDraft[];
  selectingDraftId: string | null;
  dualFailNotice: string | null;
  failedProviders: string[];
  emptyCaptionCount: number;
  emptySceneKeywordCount: number;
  showNewCutCta: boolean;
  headerTemplateId: string;
  footerTemplateId: string;
  setHeaderTemplateId: (v: string) => void;
  setFooterTemplateId: (v: string) => void;
  headerTemplates: BrandTemplateOption[];
  footerTemplates: BrandTemplateOption[];
  copyMsg: string | null;
  showCopyGuide: boolean;
  publishModalOpen: boolean;
  setPublishModalOpen: (v: boolean) => void;
  publishUrlInput: string;
  setPublishUrlInput: (v: string) => void;
  publishPlatform: "naver" | "tistory" | "other";
  setPublishPlatform: (v: "naver" | "tistory" | "other") => void;
  styleMeta: Record<string, { score?: number; repaired?: boolean; issues?: string[] }> | null;
  seoMeta: Record<
    string,
    { score?: number; repaired?: boolean; issues?: string[]; heuristic?: boolean }
  > | null;
  generateOpen: boolean;
  generatePhaseLabel: string | null;
  generateRange: { floor: number; ceiling: number };
  generateComplete: boolean;
  resultRef: React.RefObject<HTMLDivElement | null>;
  onGenerate: () => void;
  onSave: (e?: FormEvent) => void;
  onCopy: () => void;
  onSelectDraft: (id: string) => void;
  onDismissCompare: () => void;
  onRetryDraft: (provider: string) => void;
  onUpload: (files: File[]) => void;
  onFillCaptions: () => void;
  onLayoutChange: (payload: {
    slots: Array<{ type: "single" | "group"; imageIds: string[] }>;
  }) => Promise<void>;
  onRecaption: (imageId: string) => void;
  onSaveCaption: (imageId: string, caption: string) => void;
  onRemoveImage: (imageId: string) => void;
  onAddFilesToSlot: (
    slotId: string,
    files: File[],
    options?: { mergeImageIds?: string[] },
  ) => void;
  onSyncImages: () => void;
  onSaveTemplateSelection: (headerId: string, footerId: string) => void;
  onApplyTemplates: () => void;
  onSetStatus: (
    status: "published" | "archived" | "draft",
    opts?: {
      publishedUrl?: string | null;
      publishPlatform?: "naver" | "tistory" | "other" | null;
      skipUrl?: boolean;
    },
  ) => void;
  onLearnPublish: () => void;
};

type PanelTab = "review" | "style" | "photos";

const THEME_STORAGE_KEY = "ditodio-editor-theme";

function ScoreGauge({ score }: { score: number }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  return (
    <svg width="58" height="58" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c.toFixed(1)}
        strokeDashoffset={offset.toFixed(1)}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

function avgScore(meta: Record<string, { score?: number }> | null) {
  if (!meta) return null;
  const scores = Object.values(meta)
    .map((v) => v.score)
    .filter((n): n is number => typeof n === "number");
  if (!scores.length) return null;
  return Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
}

export function PostWorkspaceStudioView(p: PostWorkspaceStudioViewProps) {
  const [tab, setTab] = useState<PanelTab>("style");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }

  const generateLabel =
    p.busy === "generate"
      ? "생성 중…"
      : p.post.mode === "topic"
        ? "포스트 다시 만들기"
        : "초안 생성";

  const generateDisabled = p.busy === "generate" || !p.keyword.trim();

  const seoScore = avgScore(p.seoMeta);
  const styleScore = avgScore(p.styleMeta);
  const reviewIssues = [
    ...Object.entries(p.styleMeta ?? {}).flatMap(([k, v]) =>
      (v.issues ?? []).map((issue) => ({ source: `스타일 · ${k}`, issue })),
    ),
    ...Object.entries(p.seoMeta ?? {}).flatMap(([k, v]) =>
      (v.issues ?? []).map((issue) => ({ source: `SEO · ${k}`, issue })),
    ),
  ];

  return (
    <div
      data-theme={theme === "dark" ? "dark" : undefined}
      className="flex h-full min-h-0 flex-col bg-[var(--background)]"
    >
      <GenerationProgressModal
        open={p.generateOpen}
        title={p.busy === "retry-draft" ? "초안 재시도 중" : "초안 생성 중"}
        statusLine={p.generatePhaseLabel || "생성 준비 중…"}
        target={p.generateRange.floor}
        ceiling={p.generateRange.ceiling}
        complete={p.generateComplete}
        detail="단계가 바뀔 때마다 진행률이 올라가고, 대기 중에도 조금씩 움직입니다."
      />

      {/* Toolbar — height matches StudioShell rail logo cell (52px) */}
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <input
          className="min-h-[36px] min-w-0 flex-1 truncate border-0 bg-transparent py-1 text-[17px] font-bold leading-[1.2] text-[var(--foreground)] outline-none placeholder:font-semibold placeholder:text-[color:var(--faint)] md:text-[18px]"
          value={p.title}
          onChange={(e) => p.setTitle(e.target.value)}
          placeholder="제목 (저장 시 반영)"
          disabled={p.bodyLocked}
        />
        {p.generateOpen ? (
          <span className="hidden shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] md:inline">
            {p.generatePhaseLabel || "생성 중"}
          </span>
        ) : null}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "라이트 모드" : "다크 모드"}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[var(--border-strong)] text-[var(--muted)] hover:bg-[var(--background)]"
          >
            {theme === "dark" ? <Sun className="h-[15px] w-[15px]" strokeWidth={1.8} /> : <Moon className="h-[15px] w-[15px]" strokeWidth={1.8} />}
          </button>
          <Button
            type="button"
            size="sm"
            disabled={p.busy === "save" || p.bodyLocked}
            onClick={() => void p.onSave()}
          >
            {p.busy === "save" ? "저장 중…" : "저장"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!p.canCopy || p.busy === "copy" || p.bodyLocked}
            onClick={() => void p.onCopy()}
          >
            {p.busy === "copy" ? "복사 중…" : "본문 복사"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={p.busy === "status" || p.bodyLocked}
            onClick={() => {
              if (p.post.status === "published") {
                void p.onSetStatus("draft");
              } else {
                p.setPublishModalOpen(true);
              }
            }}
          >
            {p.post.status === "published" ? "올림 취소" : "발행 표시"}
          </Button>
          <NewCutLink
            brandId={p.post.brandId}
            postId={p.post.id}
            className={cn(
              "inline-flex h-[30px] items-center rounded-[8px] px-3 text-[12px] font-medium",
              p.showNewCutCta
                ? "bg-[var(--accent)] text-white hover:opacity-90"
                : "text-[color:var(--muted)] hover:bg-[var(--background)]",
            )}
          >
            쇼츠
          </NewCutLink>
        </div>
      </header>

      {p.error ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#F7E7E5] bg-[#F7E7E5] px-3 py-2 text-[12.5px] text-[#C2453C]">
          <span className="min-w-0 truncate">{p.error}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => p.setError(null)}>
            닫기
          </Button>
        </div>
      ) : null}

      {p.dualFailNotice || p.failedProviders.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#F4EDD8] bg-[#F4EDD8] px-3 py-2 text-[12px] text-[#8A6410]">
          <span>{p.dualFailNotice || "일부 버전 생성에 실패했습니다."}</span>
          {p.failedProviders.map((provider) => (
            <Button
              key={provider}
              type="button"
              size="sm"
              variant="outline"
              disabled={p.busy === "retry-draft"}
              onClick={() => void p.onRetryDraft(provider)}
            >
              {provider} 다시 생성
            </Button>
          ))}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[132px_1fr_330px]">
        <PostFilmstrip
          images={p.post.images}
          onOpenPhotos={() => setTab("photos")}
          onFocusImage={(imageUrl) => {
            const root = p.resultRef.current;
            if (!root) return;
            const imgs = root.querySelectorAll("img");
            let target: HTMLImageElement | null = null;
            for (const el of imgs) {
              const src = el.getAttribute("src") || "";
              if (
                src === imageUrl ||
                src.endsWith(imageUrl) ||
                imageUrl.endsWith(src) ||
                (src && imageUrl.includes(src.split("/").pop() || "___"))
              ) {
                target = el;
                break;
              }
            }
            if (!target) {
              setTab("photos");
              return;
            }
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.classList.add("ring-2", "ring-[var(--accent)]", "ring-offset-2");
            window.setTimeout(() => {
              target?.classList.remove("ring-2", "ring-[var(--accent)]", "ring-offset-2");
            }, 1600);
          }}
        />

        {/* Canvas */}
        <main
          ref={p.resultRef}
          className="min-w-0 overflow-y-auto bg-[var(--background)] px-4 pb-6 pt-0 md:px-0 md:pb-[30px] md:pt-0"
        >
          {p.bodyLocked ? (
            <div className="mx-auto flex max-w-[700px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-20 text-center shadow-sm">
              <p className="text-lg font-semibold text-[var(--foreground)]">문서 캔버스</p>
              <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                오른쪽 <strong>스타일</strong>에서 키워드를 확인한 뒤 초안을 만들면 여기에 본문이
                채워집니다. 작업이 끝나면 상단의 <strong>저장</strong>·<strong>본문 복사</strong>를
                사용하세요.
              </p>
              <Button
                type="button"
                className="mt-6"
                onClick={() => setTab("style")}
              >
                스타일로 이동
              </Button>
            </div>
          ) : p.needsSelection && p.candidateDrafts.length >= 2 ? (
            <div className="mx-auto max-w-5xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">초안 비교</h2>
                  <p className="text-sm text-[var(--muted)]">
                    마음에 드는 버전을 선택하세요. 다시 만들려면 오른쪽 스타일 탭을 이용하세요.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTab("style")}
                  >
                    스타일로 이동
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={p.busy === "select-draft"}
                    onClick={p.onDismissCompare}
                  >
                    비교 닫기
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {p.candidateDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
                  >
                    <div className="border-b border-[var(--border)] px-4 py-3">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{draft.label || "버전"}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-[var(--foreground)]">{draft.title || "(제목 없음)"}</p>
                    </div>
                    <div
                      className="rich-doc max-h-[28rem] flex-1 overflow-y-auto bg-white px-4 py-3 text-sm"
                      dangerouslySetInnerHTML={{
                        __html:
                          draft.body ||
                          '<p class="text-[color:var(--muted)]">미리볼 본문이 없습니다.</p>',
                      }}
                    />
                    <div className="border-t border-[var(--border)] p-3">
                      <Button
                        type="button"
                        className="w-full"
                        disabled={p.busy === "select-draft"}
                        onClick={() => void p.onSelectDraft(draft.id)}
                      >
                        {p.selectingDraftId === draft.id ? "선택 중…" : "이 버전 선택"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <form
              onSubmit={p.onSave}
              className="mx-auto w-full max-w-[700px] rounded-xl border border-[var(--border)] bg-white shadow-[0_1px_3px_rgba(0,0,0,.04)] md:p-[38px_46px]"
            >
              {p.post.brand.name ? (
                <p className="mb-3.5 text-[11px] font-bold tracking-[.05em] text-[var(--accent)] md:mb-3.5">
                  {p.post.brand.name}
                </p>
              ) : null}

              {p.titleCandidates.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
                  {p.titleCandidates.map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--accent-soft)]"
                      onClick={() => p.setTitle(candidate)}
                    >
                      {candidate}
                    </button>
                  ))}
                </div>
              ) : null}

              {p.editorTab === "edit" || p.editorTab === "preview" ? (
                p.editorTab === "edit" ? (
                  <RichEditor
                    value={p.body}
                    revision={p.editorRevision}
                    onChange={p.setBody}
                    placeholder="초안을 생성하면 이미지와 함께 여기에 표시됩니다."
                    className="rounded-none border-0"
                    stickyToolbar
                    headerSlot={
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
                          <button
                            type="button"
                            className={cn(
                              "rounded-md px-3 py-1.5",
                              p.editorTab === "edit"
                                ? "bg-[var(--accent)] text-white"
                                : "text-[color:var(--muted)]",
                            )}
                            onClick={() => p.setEditorTab("edit")}
                          >
                            편집
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "rounded-md px-3 py-1.5",
                              p.editorTab === "preview"
                                ? "bg-[var(--accent)] text-white"
                                : "text-[color:var(--muted)]",
                            )}
                            onClick={() => p.setEditorTab("preview")}
                          >
                            미리보기
                          </button>
                        </div>
                        {p.statusHint ? (
                          <p className="text-xs text-[color:var(--muted)]">{p.statusHint}</p>
                        ) : null}
                      </div>
                    }
                  />
                ) : (
                  <div className="space-y-0">
                    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-white px-3 py-2">
                      <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
                        <button
                          type="button"
                          className="rounded-md px-3 py-1.5 text-[color:var(--muted)]"
                          onClick={() => p.setEditorTab("edit")}
                        >
                          편집
                        </button>
                        <button
                          type="button"
                          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-white"
                          onClick={() => p.setEditorTab("preview")}
                        >
                          미리보기
                        </button>
                      </div>
                    </div>
                    <div
                      className="rich-doc min-h-[28rem] px-5 py-4 md:px-6"
                      dangerouslySetInnerHTML={{
                        __html:
                          p.body ||
                          '<p class="text-[color:var(--muted)]">미리볼 본문이 없습니다.</p>',
                      }}
                    />
                  </div>
                )
              ) : null}

              {p.copyMsg || p.showCopyGuide ? (
                <div className="mx-4 mb-4 space-y-2 rounded-lg border border-[#CDEBDD] bg-[#E7F5EF] px-3 py-3 text-sm text-[#0F7B52] md:mx-6">
                  {p.copyMsg ? <p className="font-medium">{p.copyMsg}</p> : null}
                  <ol className="list-decimal space-y-1 pl-4 text-[#0F7B52]/90">
                    <li>네이버·티스토리 글쓰기에 붙여넣기</li>
                    <li>사진·서식이 깨지면 용량·이미지 개수를 줄여 다시 복사</li>
                    <li>올렸다면 상단 <strong>발행</strong>으로 기록</li>
                  </ol>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="submit" disabled={p.busy === "save" || p.bodyLocked}>
                  {p.busy === "save" ? "저장 중…" : "저장"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!p.canCopy || p.busy === "copy" || p.bodyLocked}
                  onClick={() => void p.onCopy()}
                >
                  {p.busy === "copy" ? "복사 중…" : "본문 복사"}
                </Button>
                {p.post.status === "archived" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={p.busy === "status"}
                    onClick={() => void p.onSetStatus("draft")}
                  >
                    보관 해제
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={p.busy === "status"}
                    onClick={() => void p.onSetStatus("archived")}
                  >
                    보관
                  </Button>
                )}
              </div>
            </form>
          )}
        </main>

        {/* AI panel */}
        <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
          <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-[var(--border)] px-2">
            {(
              [
                ["style", "스타일"],
                ["review", "검수"],
                ["photos", "이미지"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex h-[26px] items-center rounded-[7px] px-2.5 text-[11.5px] font-semibold",
                  tab === id
                    ? "bg-[var(--foreground)] text-[var(--surface)]"
                    : "text-[color:var(--faint)] hover:bg-[var(--background)]",
                )}
              >
                {label}
                {id === "photos" && p.post.images.length > 0 ? (
                  <span className="ml-1 opacity-70">{p.post.images.length}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
            {tab === "review" ? (
              seoScore === null && styleScore === null ? (
                <p className="text-[12px] text-[var(--muted)]">
                  초안을 생성하면 스타일·SEO 점수와 검수 항목이 여기에 표시됩니다.
                </p>
              ) : (
                <>
                  {seoScore !== null ? (
                    <div className="flex items-center gap-3.5 rounded-[11px] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
                      <ScoreGauge score={seoScore} />
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-baseline gap-1">
                          <span className="[font-variant-numeric:tabular-nums] text-[23px] font-bold text-[var(--foreground)]">
                            {seoScore}
                          </span>
                          <span className="text-[12px] text-[var(--faint)]">/ 100</span>
                        </div>
                        <span className="text-[11.5px] font-semibold text-[var(--muted)]">검색 노출 점수 (SEO)</span>
                      </div>
                    </div>
                  ) : null}
                  {styleScore !== null ? (
                    <div className="flex items-center justify-between rounded-[11px] border border-[var(--border)] px-3.5 py-2.5 text-[12px]">
                      <span className="text-[var(--muted)]">스타일 일치도</span>
                      <span className="[font-variant-numeric:tabular-nums] font-bold text-[var(--foreground)]">{styleScore} / 100</span>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-bold tracking-[.04em] text-[var(--faint)]">체크리스트</span>
                    {reviewIssues.length === 0 ? (
                      <p className="text-[12px] text-[var(--muted)]">발견된 이슈가 없습니다.</p>
                    ) : (
                      reviewIssues.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 rounded-[9px] border border-[var(--border)] p-2.5"
                        >
                          <span className="mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-[#F4EDD8] text-[9px] font-extrabold text-[#8A6410]">
                            !
                          </span>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[12px] font-semibold text-[var(--foreground)]">{item.issue}</span>
                            <span className="text-[10.5px] text-[var(--faint)]">{item.source}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )
            ) : null}

            {tab === "style" ? (
              <>
                <Label>
                  <span>주요 키워드</span>
                  <Input
                    value={p.keyword}
                    onChange={(e) => p.setKeyword(e.target.value)}
                    placeholder={
                      p.post.mode === "topic"
                        ? "예: 현재 주가가 내리는 이유"
                        : "예: 쏘렌토 MQ4 고토 루프박스"
                    }
                    maxLength={120}
                  />
                  <span className="mt-1 block text-xs font-normal text-[color:var(--muted)]">
                    제목·본문의 중심이 되는 말을 짧게 적어 주세요.
                  </span>
                </Label>

                {p.post.mode !== "topic" ? (
                  <Label>
                    <span>생성에 참고할 내용</span>
                    <Textarea
                      rows={4}
                      value={p.productHighlights}
                      onChange={(e) => p.setProductHighlights(e.target.value)}
                      placeholder="제품 특장점, 생성 시 필요한 키워드나 문장을 입력해 주세요."
                      maxLength={2000}
                    />
                    <span className="mt-1 block text-xs font-normal text-[color:var(--muted)]">
                      비워도 됩니다. 적을수록 초안이 구체적으로 나옵니다.
                    </span>
                  </Label>
                ) : null}

                {p.post.mode !== "topic" && p.post.images.length > 0 ? (
                  <LearnedSupplementPanel
                    postId={p.post.id}
                    keyword={p.keyword}
                    productHighlights={p.productHighlights}
                    imagePrompts={p.post.images.map((img) => img.caption || "")}
                    enabled={p.useLearnedSupplement}
                    onEnabledChange={p.setUseLearnedSupplement}
                    excludedPoints={p.excludedSupplementPoints}
                    onExcludedChange={p.setExcludedSupplementPoints}
                  />
                ) : null}

                <Label>
                  <span>문장체</span>
                  <select
                    className="mt-1.5 flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    value={p.captionTone || BRAND_CAPTION_TONE}
                    onChange={(e) => p.setCaptionTone(e.target.value)}
                  >
                    {p.toneOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label>
                  <span>글 길이</span>
                  <select
                    className="mt-1.5 flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    value={p.draftLength}
                    onChange={(e) => {
                      const next = e.target.value as TopicLength;
                      p.setDraftLength(next);
                      if (p.post.mode === "topic") {
                        p.setTopicImageCount(TOPIC_LENGTH_PRESETS[next].sectionCount);
                      }
                    }}
                  >
                    {TOPIC_LENGTHS.map((id) => (
                      <option key={id} value={id}>
                        {TOPIC_LENGTH_PRESETS[id].label}
                      </option>
                    ))}
                  </select>
                </Label>

                {p.post.mode === "topic" ? (
                  <>
                    <button
                      type="button"
                      className="text-xs text-[var(--accent)] hover:underline"
                      onClick={() => setAdvancedOpen((v) => !v)}
                    >
                      {advancedOpen ? "이미지 옵션 접기" : "이미지 옵션"}
                    </button>
                    {advancedOpen ? (
                      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/80 p-2.5">
                        <Label>
                          <span>이미지 수</span>
                          <Input
                            type="number"
                            min={1}
                            max={6}
                            value={p.topicImageCount}
                            onChange={(e) =>
                              p.setTopicImageCount(
                                Math.min(6, Math.max(1, Number(e.target.value) || 1)),
                              )
                            }
                          />
                        </Label>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={p.topicUseAiImages}
                            onChange={(e) => p.setTopicUseAiImages(e.target.checked)}
                          />
                          AI 이미지
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={p.topicReplaceImages}
                            onChange={(e) => p.setTopicReplaceImages(e.target.checked)}
                          />
                          기존 이미지 교체
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--foreground)]">머리말·꼬리말</p>
                    <Link
                      href={`/brands/${p.post.brandId}/templates`}
                      className="text-xs text-[color:var(--muted)] hover:text-[var(--accent)]"
                    >
                      관리
                    </Link>
                  </div>
                  <Label>
                    <span>머리말</span>
                    <select
                      className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      value={p.headerTemplateId}
                      disabled={p.busy === "template-select" || p.busy === "template-apply"}
                      onChange={(e) => {
                        const next = e.target.value;
                        p.setHeaderTemplateId(next);
                        void p.onSaveTemplateSelection(next, p.footerTemplateId);
                      }}
                    >
                      <option value="">선택 안 함</option>
                      {p.headerTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Label>
                  <Label>
                    <span>꼬리말</span>
                    <select
                      className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      value={p.footerTemplateId}
                      disabled={p.busy === "template-select" || p.busy === "template-apply"}
                      onChange={(e) => {
                        const next = e.target.value;
                        p.setFooterTemplateId(next);
                        void p.onSaveTemplateSelection(p.headerTemplateId, next);
                      }}
                    >
                      <option value="">선택 안 함</option>
                      {p.footerTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      p.busy === "template-apply" || (!p.headerTemplateId && !p.footerTemplateId)
                    }
                    onClick={() => void p.onApplyTemplates()}
                  >
                    {p.busy === "template-apply" ? "적용 중…" : "본문에 적용"}
                  </Button>
                </div>

                <div className="space-y-1.5 border-t border-[var(--border)] pt-3.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => void p.onGenerate()}
                    disabled={generateDisabled}
                  >
                    {generateLabel}
                  </Button>
                  <p className="text-[10px] leading-snug text-[color:var(--muted)]">
                    키워드·참고 내용을 바꿔 초안을 다시 만듭니다.
                  </p>
                </div>
              </>
            ) : null}

            {tab === "photos" ? (
              <>
                <ImageUploadDropzone
                  disabled={p.busy === "upload"}
                  onFiles={(files) => void p.onUpload(files)}
                />
                {p.emptyCaptionCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#F4EDD8] bg-[#F4EDD8] px-2 py-1.5 text-xs text-[#8A6410]">
                    <span>빈 장면 키워드 {p.emptyCaptionCount}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={p.busy === "fill-captions"}
                      onClick={() => void p.onFillCaptions()}
                    >
                      자동 채우기
                    </Button>
                  </div>
                ) : null}
                {p.emptySceneKeywordCount > 0 ? (
                  <Badge variant="warning">장면 키워드 비어 있음 {p.emptySceneKeywordCount}</Badge>
                ) : null}
                <ImageGalleryBoard
                  images={p.post.images}
                  busy={p.busy}
                  onLayoutChange={p.onLayoutChange}
                  onRecaption={(id) => void p.onRecaption(id)}
                  onSaveCaption={(id, caption) => void p.onSaveCaption(id, caption)}
                  onRemove={(id) => void p.onRemoveImage(id)}
                  onAddFilesToSlot={(slotId, files, options) =>
                    void p.onAddFilesToSlot(slotId, files, options)
                  }
                />
                {p.post.images.length > 0 && p.body.trim() && !p.needsSelection ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={p.busy === "save"}
                    onClick={() => void p.onSyncImages()}
                  >
                    본문에 사진 넣기
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="shrink-0 space-y-1.5 border-t border-[var(--border)] p-3">
            <div className="flex gap-1.5">
              <Button
                type="button"
                className="flex-1"
                disabled={p.busy === "save" || p.bodyLocked}
                onClick={() => void p.onSave()}
              >
                {p.busy === "save" ? "저장 중…" : "저장"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={!p.canCopy || p.busy === "copy" || p.bodyLocked}
                onClick={() => void p.onCopy()}
              >
                {p.busy === "copy" ? "복사 중…" : "본문 복사"}
              </Button>
            </div>
            {tab !== "style" ? (
              <p className="text-[10px] leading-snug text-[color:var(--muted)]">
                초안을 다시 만들려면{" "}
                <button
                  type="button"
                  className="font-semibold text-[var(--accent)] hover:underline"
                  onClick={() => setTab("style")}
                >
                  스타일
                </button>{" "}
                탭을 이용하세요.
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {p.publishModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl border border-[var(--border)] bg-white p-4 shadow-lg">
            <p className="text-sm font-semibold">올린 글 URL (선택)</p>
            <p className="text-xs text-[color:var(--muted)]">
              외부에 직접 올린 뒤 여기서 완료로 표시합니다.
            </p>
            <select
              className="flex h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm"
              value={p.publishPlatform}
              onChange={(e) =>
                p.setPublishPlatform(e.target.value as "naver" | "tistory" | "other")
              }
            >
              <option value="naver">네이버</option>
              <option value="tistory">티스토리</option>
              <option value="other">기타</option>
            </select>
            <Input
              value={p.publishUrlInput}
              onChange={(e) => p.setPublishUrlInput(e.target.value)}
              placeholder="https://"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={p.busy === "status"}
                onClick={() =>
                  void p.onSetStatus("published", {
                    publishedUrl: p.publishUrlInput || undefined,
                    publishPlatform: p.publishPlatform,
                  })
                }
              >
                올림 표시
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => p.setPublishModalOpen(false)}
              >
                닫기
              </Button>
              {p.post.status === "published" ? (
                <Button type="button" variant="ghost" onClick={() => void p.onLearnPublish()}>
                  스타일 학습에 추가
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
