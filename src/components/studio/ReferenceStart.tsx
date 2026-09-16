"use client";

import { Check, ChevronLeft, ImagePlus, Link as LinkIcon, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BRAND_CAPTION_TONE } from "@/lib/caption-tones";
import { USE_DEFAULT_THEME_ID } from "@/lib/default-theme";
import { startGenerationJobClient } from "@/lib/run-generation-job-client";
import { cn } from "@/lib/utils";

type Voice = { id: string; name: string; version: number | null };

type Preview = {
  title: string | null;
  sourceUrl: string;
  charCount: number;
  paragraphCount: number;
  imageCount: number;
  sections: string[];
  topics: string[];
  keywords: string[];
};

type ToggleKey = "structure" | "length" | "topics" | "keywords";

function fmtNumber(n: number) {
  return n.toLocaleString("ko-KR");
}

export function ReferenceStart({
  initialUrl,
  voices,
}: {
  initialUrl: string;
  voices: Voice[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const [topic, setTopic] = useState("");
  const [voiceId, setVoiceId] = useState<string>(voices[0]?.id ?? USE_DEFAULT_THEME_ID);
  const [includePhotos, setIncludePhotos] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    structure: true,
    length: true,
    topics: true,
    keywords: false,
  });

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const triedRef = useRef(false);

  async function readUrl(target: string) {
    if (!target.trim()) return;
    setLoading(true);
    setReadError(null);
    try {
      const res = await fetch("/api/reference/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Preview> & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "글을 읽지 못했습니다.");
      }
      setPreview(data as Preview);
    } catch (e) {
      setPreview(null);
      setReadError(e instanceof Error ? e.message : "글을 읽지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;
    if (!initialUrl.trim()) return;
    const timer = setTimeout(() => void readUrl(initialUrl), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: ToggleKey) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const ctaEnabled = Boolean(preview) && !loading;

  async function submit() {
    if (!preview || busy) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: voiceId === USE_DEFAULT_THEME_ID ? null : voiceId,
          mode: "worklog",
          keyword: topic.trim() || undefined,
          captionTone: BRAND_CAPTION_TONE,
          referenceUrl: preview.sourceUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        post?: { id: string };
      };
      if (!res.ok || !data.post?.id) {
        throw new Error(data.error || "글을 만들지 못했습니다.");
      }
      const postId = data.post.id;

      if (includePhotos) {
        for (const file of photos) {
          const form = new FormData();
          form.set("file", file);
          form.set("autoCaption", "true");
          await fetch(`/api/posts/${postId}/images`, { method: "POST", body: form }).catch(
            () => null,
          );
        }
      }

      await startGenerationJobClient(postId, {
        kind: "generate_reference",
        referenceUrl: preview.sourceUrl,
        keyword: toggles.topics ? topic.trim() || undefined : undefined,
        replaceImages: !(includePhotos && photos.length > 0),
      });

      router.push(`/posts/${postId}?generating=1`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "글을 만들지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-4">
        <Link
          href="/dashboard"
          aria-label="뒤로"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#C2C2CC] hover:bg-[var(--surface-2)] hover:text-[var(--muted)]"
        >
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} />
        </Link>
        <span className="text-[14.5px] font-bold text-[var(--foreground)]">이 글처럼 쓰기</span>
        <span className="flex h-5 items-center rounded-[6px] bg-[#F0F0F3] px-2 text-[11px] font-bold text-[var(--muted)]">
          2 / 2
        </span>
        <div className="flex-1" />
        <Link href="/dashboard" className="text-[12px] text-[var(--hint)] hover:text-[var(--muted)]">
          방식 바꾸기
        </Link>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_340px] lg:overflow-hidden">
        <div className="mx-auto flex w-full max-w-[620px] flex-col gap-[17px] px-[26px] py-6 lg:min-h-0 lg:overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--muted)]">참고할 글 주소</span>
            <div
              className={cn(
                "flex h-12 items-center gap-2.5 rounded-[12px] border-[1.5px] px-3.5",
                readError ? "border-[#C2453C]" : "border-[var(--accent)]",
              )}
            >
              <LinkIcon
                className={cn("h-[17px] w-[17px] shrink-0", readError ? "text-[#C2453C]" : "text-[var(--accent)]")}
                strokeWidth={1.9}
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void readUrl(url);
                  }
                }}
                placeholder="blog.naver.com/..."
                className="h-full flex-1 truncate border-0 bg-transparent p-0 text-[14.5px] text-[var(--foreground)] outline-none placeholder:text-[var(--hint)]"
              />
              {preview && !loading ? (
                <span className="flex h-[26px] shrink-0 items-center gap-1 rounded-[7px] bg-[#E7F5EF] px-2 text-[11px] font-bold text-[#0F7B52]">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                  읽었습니다
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void readUrl(url)}
                  disabled={loading || !url.trim()}
                  className="shrink-0 text-[12.5px] font-semibold text-[var(--accent)] disabled:opacity-50"
                >
                  {loading ? "읽는 중…" : "다시 읽기"}
                </button>
              )}
            </div>
            {readError ? <p className="text-[12px] text-[#C2453C]">{readError}</p> : null}
          </div>

          {preview ? (
            <div className="flex flex-col gap-[13px] rounded-[14px] border border-[var(--border)] bg-white p-[17px_18px]">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-bold text-[var(--foreground)]">이 글의 구성</span>
                <span className="[font-variant-numeric:tabular-nums] text-[11.5px] text-[var(--hint)]">
                  {fmtNumber(preview.charCount)}자 · 사진 {preview.imageCount}
                </span>
              </div>
              {preview.title ? (
                <p className="text-[14.5px] font-semibold leading-[1.5] text-[var(--foreground)]">
                  {preview.title}
                </p>
              ) : null}
              <div className="flex flex-col gap-1.5">
                {preview.sections.map((section, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-[9px] border border-[#F0F0F3] bg-[var(--surface-2)] px-[11px] py-[9px]"
                  >
                    <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[6px] bg-[#EDEDF1] text-[10px] font-bold text-[var(--muted)]">
                      {i + 1}
                    </span>
                    <span className="truncate text-[12.5px] text-[#3A3A44]">{section}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--muted)]">
              내가 쓸 주제 <span className="text-[var(--hint)]">— 같은 구조로, 내 현장 이야기로</span>
            </span>
            <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--border-strong)] p-[15px]">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="어떤 이야기로 쓸지 적어 주세요"
                className="border-0 bg-transparent p-0 text-[16px] font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--hint)]"
              />
              <div className="flex flex-wrap items-center gap-2">
                {voices.map((v) => {
                  const selected = v.id === voiceId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVoiceId(v.id)}
                      className={cn(
                        "flex h-[31px] items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors",
                        selected
                          ? "border border-[#D9D4FF] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                          : "border border-[var(--border)] bg-white font-medium text-[var(--muted)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      {v.name}
                      {v.version != null ? (
                        <span className="text-[10.5px] font-bold opacity-75">v{v.version}</span>
                      ) : null}
                    </button>
                  );
                })}
                <Link
                  href="/brands/new"
                  className="flex h-[31px] items-center gap-1 rounded-full border border-dashed border-[#D4D4DB] bg-white px-3 text-[12.5px] font-medium text-[#8A8A94] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />새 말투
                </Link>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-[12px] border border-[#F0F0F3] bg-[var(--surface-2)] px-3.5 py-3">
            <button
              type="button"
              role="switch"
              aria-checked={includePhotos}
              onClick={() => setIncludePhotos((v) => !v)}
              className={cn(
                "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
                includePhotos ? "bg-[var(--accent)]" : "bg-[#E0E0E6]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-[14px] w-[14px] rounded-full bg-white transition-transform",
                  includePhotos ? "translate-x-[16px]" : "translate-x-[2px]",
                )}
              />
            </button>
            <span className="text-[12.5px] text-[var(--muted)]">
              내 사진도 함께 넣기{" "}
              <span className="text-[var(--hint)]">— 없으면 이미지를 만들어 넣습니다</span>
            </span>
          </div>

          {includePhotos ? (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-[12px] border border-dashed border-[#D4D4DB] bg-[var(--surface-2)] px-3.5 py-3">
              <ImagePlus className="h-[18px] w-[18px] shrink-0 text-[var(--hint)]" strokeWidth={1.7} />
              <span className="text-[13px] text-[#8A8A94]">
                {photos.length > 0 ? `사진 ${photos.length}장 선택됨` : "사진을 선택하세요"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => setPhotos(Array.from(e.target.files || []))}
              />
            </label>
          ) : null}
        </div>

        <div className="flex flex-col gap-3.5 border-t border-[var(--border)] bg-white px-5 py-[22px] lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="flex flex-col gap-1">
            <span className="text-[13.5px] font-bold text-[var(--foreground)]">무엇을 가져올까요</span>
            <p className="text-[11.5px] leading-[1.5] text-[#9C9CA6]">
              구조와 흐름만 참고합니다. 문장은 내 말투로 새로 씁니다.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {(
              [
                {
                  key: "structure" as const,
                  label: "소제목 구성 4단계",
                  subtitle: preview?.sections.length
                    ? preview.sections.join(" → ")
                    : "글을 읽으면 표시됩니다",
                },
                {
                  key: "length" as const,
                  label: "글 길이 · 단락 호흡",
                  subtitle: preview
                    ? `약 ${fmtNumber(preview.charCount)}자 · 단락 ${preview.paragraphCount}개`
                    : "글을 읽으면 표시됩니다",
                },
                {
                  key: "topics" as const,
                  label: "다루는 항목",
                  subtitle: preview?.topics.length
                    ? preview.topics.join(", ")
                    : "글을 읽으면 표시됩니다",
                },
                {
                  key: "keywords" as const,
                  label: "검색 키워드",
                  subtitle: preview?.keywords.length
                    ? preview.keywords.join(", ")
                    : "글을 읽으면 표시됩니다",
                },
              ] as const
            ).map((item) => {
              const on = toggles[item.key];
              return (
                <div
                  key={item.key}
                  className={cn(
                    "flex items-center gap-[11px] rounded-[11px] border border-[var(--border)] px-[13px] py-3",
                    on ? "bg-white" : "bg-[var(--surface-2)]",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn("text-[13px] font-semibold", on ? "text-[var(--foreground)]" : "text-[#8A8A94]")}>
                      {item.label}
                    </span>
                    <span className={cn("truncate text-[11.5px] leading-[1.5]", on ? "text-[#9C9CA6]" : "text-[var(--hint)]")}>
                      {item.subtitle}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggle(item.key)}
                    className={cn(
                      "relative h-5 w-[34px] shrink-0 rounded-full transition-colors",
                      on ? "bg-[var(--accent)]" : "bg-[#E0E0E6]",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                        on ? "translate-x-[16px]" : "translate-x-[2px]",
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-[7px] rounded-[11px] border border-[#F0DFB4] bg-[#FDF9EE] px-[13px] py-3">
            <span className="text-[12px] font-bold text-[#6B4E10]">가져오지 않는 것</span>
            <ul className="flex flex-col gap-0.5 text-[11.5px] leading-[1.5] text-[#8A6410]">
              <li>· 문장과 표현 — 전부 새로 씁니다</li>
              <li>· 사진 — 원저작자의 것입니다</li>
              <li>· 상호 · 가격 · 연락처</li>
            </ul>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            {submitError ? <p className="text-center text-[12px] text-[#C2453C]">{submitError}</p> : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!ctaEnabled || busy}
              className="flex h-[50px] items-center justify-center rounded-[12px] bg-[var(--accent)] text-[15px] font-semibold text-white shadow-[0_2px_8px_rgba(0,100,255,.34)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-[#EDEDF1] disabled:text-[var(--hint)] disabled:shadow-none"
            >
              {busy ? "만드는 중…" : "초안 만들기"}
            </button>
            <p className="text-center text-[11.5px] text-[var(--hint)]">
              참고한 글은 발행 기록에 함께 남습니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
