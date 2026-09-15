"use client";

import { ChevronLeft, Clapperboard, Palette, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NewCutLink } from "@/components/NewCutLink";
import { copyHtmlForBlogEditor } from "@/lib/clipboard";
import { htmlToPlainText } from "@/lib/content";
import { cn } from "@/lib/utils";

// Naver mobile-web blog composer. App deep links (naverblog://, naversearchapp://)
// still need real-device validation before we swap this out.
const NAVER_WRITE_URL = "https://m.blog.naver.com/GoBlogWrite.naver";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function MobilePublish({
  postId,
  brandId,
  initialTitle,
  altTitles,
  bodyHtml,
  updatedLabel,
}: {
  postId: string;
  brandId: string | null;
  initialTitle: string;
  altTitles: string[];
  bodyHtml: string;
  updatedLabel: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "done" | "text-only">("idle");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  async function persistTitle(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === initialTitle) return;
    await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    }).catch(() => undefined);
  }

  async function copyAndOpen() {
    setCopyState("copying");
    setNote(null);
    const html = `<h1>${escapeHtml(title)}</h1>${bodyHtml}`;
    const plain = [title.trim(), "", htmlToPlainText(bodyHtml)].filter(Boolean).join("\n");
    try {
      await copyHtmlForBlogEditor(html, plain, "naver");
      setCopyState("done");
    } catch {
      try {
        await navigator.clipboard.writeText(plain);
      } catch {
        // clipboard unavailable
      }
      setCopyState("text-only");
      setNote("본문만 복사됐어요. 사진은 네이버 글쓰기에서 앨범으로 첨부하세요.");
    }
    window.open(NAVER_WRITE_URL, "_blank", "noopener,noreferrer");
  }

  async function markPublished() {
    if (busy) return;
    setBusy(true);
    setNote(null);

    let publishedUrl = url.trim();
    if (publishedUrl && !/^https?:\/\//i.test(publishedUrl)) {
      publishedUrl = `https://${publishedUrl}`;
    }

    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "published",
        publishPlatform: "naver",
        ...(publishedUrl ? { publishedUrl } : {}),
      }),
    }).catch(() => null);

    if (res && res.ok) {
      if (publishedUrl) {
        // Re-learn the voice from the version actually posted (incl. manual edits).
        fetch(`/api/posts/${postId}/learn-from-publish`, { method: "POST" }).catch(
          () => undefined,
        );
      }
      window.location.assign("/m/posts");
      return;
    }
    setBusy(false);
    setNote(
      publishedUrl
        ? "기록에 실패했습니다. 주소 형식을 확인해 주세요."
        : "기록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  const ctaLabel =
    copyState === "copying"
      ? "복사하는 중…"
      : copyState === "done"
        ? "복사됨 — 네이버 다시 열기"
        : copyState === "text-only"
          ? "본문만 복사됨 — 네이버 다시 열기"
          : "복사해서 네이버 앱 열기";

  return (
    <main className="flex min-h-[100dvh] flex-col bg-white pb-[232px]">
      <div className="flex h-[54px] items-center gap-1.5 border-b border-[#F0F0F3] px-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center text-[var(--foreground)]"
          aria-label="뒤로"
        >
          <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2} />
        </button>
        <span className="text-[15px] font-bold text-[var(--foreground)]">초안</span>
        <span className="ml-auto text-[11.5px] text-[var(--hint)] [font-variant-numeric:tabular-nums]">
          {updatedLabel}
        </span>
      </div>

      <div className="flex flex-col gap-4 px-5 pt-4">
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-[#9C9CA6]">제목 — 눌러서 바꾸기</span>
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                void persistTitle(title);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="rounded-[10px] border border-[var(--accent)] px-3 py-2 text-[20px] font-bold leading-[1.4] text-[var(--foreground)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="text-left text-[20px] font-bold leading-[1.4] text-[var(--foreground)]"
            >
              {title || "(제목 없음)"}
            </button>
          )}
          {altTitles.filter((t) => t !== title).length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {altTitles
                .filter((t) => t !== title)
                .map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTitle(t);
                    void persistTitle(t);
                  }}
                  className="flex h-[30px] items-center rounded-full border border-[var(--border)] px-3 text-[12px] text-[#6B6B75]"
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div
          className="rich-doc"
          // Draft body is generated server-side from our own pipeline.
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        <div className="flex flex-col gap-2.5 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-[#6B6B75]">
              올린 뒤, 글 주소를 여기에
            </span>
            <span className="flex h-[19px] items-center rounded-[5px] bg-[#F0F0F3] px-[7px] text-[10px] font-bold text-[#8A8A94]">
              선택
            </span>
          </div>
          <input
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="blog.naver.com/..."
            className="h-[46px] rounded-[11px] border border-[#E0E0E6] bg-white px-3.5 text-[13.5px] text-[var(--foreground)] outline-none placeholder:text-[#B4B4BE] focus:border-[var(--accent)]"
          />
          <div className="flex items-start gap-2 rounded-[11px] border border-[#F0F0F3] bg-[var(--surface-2)] p-3">
            <Palette className="mt-px h-[15px] w-[15px] shrink-0 text-[var(--accent)]" strokeWidth={1.9} />
            <span className="text-[12px] leading-[1.55] text-[#6B6B75]">
              주소를 넣으면 <strong className="font-semibold">실제로 올린 최종본</strong>을 읽어 말투를
              다시 학습합니다. 직접 고친 부분까지 반영돼 다음 글이 더 비슷해집니다.
            </span>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[480px] border-t border-[#F0F0F3] bg-white px-5 pb-[26px] pt-3">
        {note ? (
          <p className="pb-2 text-center text-[11.5px] text-[#8A6410]">{note}</p>
        ) : null}
        <div className="flex gap-2.5 pb-2.5">
          <button
            type="button"
            onClick={() => router.replace(`/m/g/${postId}`)}
            className="flex h-[50px] flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-[#E0E0E6] text-[13.5px] font-semibold text-[#3A3A44]"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.9} />
            다시 쓰기
          </button>
          <NewCutLink
            postId={postId}
            brandId={brandId ?? undefined}
            className="flex h-[50px] flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-[#E0E0E6] text-[13.5px] font-semibold text-[#3A3A44]"
          >
            <Clapperboard className="h-4 w-4" strokeWidth={1.9} />
            쇼츠로
          </NewCutLink>
        </div>
        <button
          type="button"
          onClick={() => void copyAndOpen()}
          disabled={copyState === "copying"}
          className={cn(
            "flex h-14 w-full items-center justify-center rounded-[15px] bg-[var(--accent)] text-[16px] font-semibold text-white disabled:opacity-60",
          )}
        >
          {ctaLabel}
        </button>
        <div className="flex items-center justify-center gap-3 pt-2">
          <span className="text-[11.5px] text-[#B4B4BE]">
            사진까지 함께 복사됩니다 · 붙여넣기만 하세요
          </span>
        </div>
        <button
          type="button"
          onClick={() => void markPublished()}
          disabled={busy}
          className="mx-auto mt-1.5 block text-[12.5px] font-semibold text-[#8A8A94] disabled:opacity-60"
        >
          {busy
            ? "기록하는 중…"
            : url.trim()
              ? "올림 완료로 기록 + 말투 재학습"
              : "올림 완료로 기록"}
        </button>
      </div>
    </main>
  );
}
