"use client";

import { ArrowRight, GripVertical, ImageIcon, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { USE_DEFAULT_THEME_ID } from "@/lib/default-theme";
import { cn } from "@/lib/utils";

type Voice = { id: string; name: string; version: number | null };

/** `auto` = caption still the generated default (not user-edited). */
type Photo = { file: File; url: string; caption: string; auto: boolean };

function defaultCaption(topic: string, index: number) {
  const t = topic.trim();
  return t ? `${t} · 사진 ${index + 1}` : `현장 사진 ${index + 1}`;
}

export function HomeStart({ voices }: { voices: Voice[] }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [voiceId, setVoiceId] = useState<string>(voices[0]?.id ?? USE_DEFAULT_THEME_ID);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photosRef = useRef<Photo[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [],
  );

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const next = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ file, url: URL.createObjectURL(file), caption: "", auto: true }));
    if (next.length) setPhotos((prev) => [...prev, ...next]);
  }

  function setCaption(index: number, value: string) {
    setPhotos((prev) =>
      prev.map((p, i) => (i === index ? { ...p, caption: value, auto: false } : p)),
    );
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function reorder(from: number, to: number) {
    setPhotos((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function submit() {
    if (busy) return;
    if (!topic.trim() && photos.length === 0) {
      setError("한 줄 주제를 적거나 현장 사진을 올려 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: voiceId === USE_DEFAULT_THEME_ID ? null : voiceId,
          mode: "worklog",
          keyword: topic.trim() || undefined,
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

      for (const p of photos) {
        // Untouched (auto) captions are left to the server's vision pass.
        const manual = p.auto ? "" : p.caption.trim();
        const form = new FormData();
        form.set("file", p.file);
        form.set("autoCaption", manual ? "false" : "true");
        const upRes = await fetch(`/api/posts/${postId}/images`, {
          method: "POST",
          body: form,
        }).catch(() => null);

        if (manual && upRes && upRes.ok) {
          const upData = (await upRes.json().catch(() => null)) as {
            image?: { id: string };
          } | null;
          const imageId = upData?.image?.id;
          if (imageId) {
            await fetch(`/api/posts/${postId}/images/${imageId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ caption: manual }),
            }).catch(() => undefined);
          }
        }
      }

      router.push(`/posts/${postId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "글을 만들지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-[18px] border border-[var(--border-strong)] bg-white p-[18px] pb-3.5 shadow-[0_2px_10px_rgba(22,22,26,.05)] focus-within:shadow-[0_0_0_1px_var(--accent)]">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-[22px] w-[22px] shrink-0 text-[var(--accent)]" strokeWidth={1.7} />
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={`예: "신메뉴 밤 라떼 소개" · "원목 식탁 도장 후기"`}
          className="min-h-[27px] flex-1 resize-none border-0 bg-transparent p-0 text-[18px] font-medium leading-[1.5] text-[var(--foreground)] outline-none placeholder:text-[13px] placeholder:font-normal placeholder:text-[var(--hint)]"
        />
      </div>

      <div className="h-px bg-[#F0F0F3]" />

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[12.5px] font-semibold text-[var(--faint)]">말투</span>
        {voices.map((v) => {
          const selected = v.id === voiceId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setVoiceId(v.id)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors",
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
          className="flex h-8 items-center gap-1 rounded-full border border-dashed border-[#D4D4DB] bg-white px-3 text-[12.5px] font-medium text-[#8A8A94] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />새 말투
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-1 cursor-pointer items-center gap-2.5 rounded-[12px] border border-dashed bg-[var(--surface-2)] px-3.5 py-3 transition-colors",
            dragOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[#D4D4DB]",
          )}
        >
          <ImageIcon className="h-[18px] w-[18px] shrink-0 text-[var(--hint)]" strokeWidth={1.7} />
          {photos.length > 0 ? (
            <span className="text-[13px] text-[var(--muted)]">
              사진 {photos.length}장{" "}
              <span className="text-[var(--hint)]">· 더 끌어다 놓거나 눌러서 추가</span>
            </span>
          ) : (
            <span className="text-[13px] text-[#8A8A94]">
              현장 사진을 여기에 끌어다 놓으세요{" "}
              <span className="text-[var(--hint)]">· 없어도 시작할 수 있어요</span>
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="flex h-12 shrink-0 items-center gap-2 rounded-[12px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(75,59,255,.35)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {busy ? "만드는 중…" : "글 만들기"}
          {!busy ? <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2} /> : null}
        </button>
      </div>

      {photos.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--foreground)]">
              올린 사진 {photos.length}장
            </span>
            <span className="text-[11.5px] text-[var(--hint)]">
              · 드래그로 순서 변경 · 설명은 그대로 두면 제가 씁니다
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {photos.map((p, i) => (
              <div
                key={p.url}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) reorder(dragIndex, i);
                  setDragIndex(null);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-[10px] transition-colors",
                  dragIndex === i && "opacity-40",
                  dragIndex !== null && dragIndex !== i && "bg-white",
                )}
              >
                <span
                  draggable={!busy}
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => setDragIndex(null)}
                  className="flex h-14 w-5 shrink-0 cursor-grab items-center justify-center text-[var(--hint)] active:cursor-grabbing"
                  title="드래그하여 순서 변경"
                >
                  <GripVertical className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[9px] border border-[var(--border)] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" draggable={false} />
                  <span className="absolute left-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[rgba(22,22,26,.72)] px-1 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                </span>
                <input
                  value={p.auto ? defaultCaption(topic, i) : p.caption}
                  onChange={(e) => setCaption(i, e.target.value)}
                  placeholder="이 사진은 무엇인가요?"
                  className={cn(
                    "h-10 flex-1 rounded-[9px] border border-[var(--border)] bg-white px-3 text-[13px] outline-none placeholder:text-[var(--hint)] focus:border-[var(--accent)]",
                    p.auto ? "text-[var(--faint)]" : "text-[var(--foreground)]",
                  )}
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--faint)] transition-colors hover:bg-white hover:text-[#C2453C]"
                  aria-label={`${i + 1}번 사진 빼기`}
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-[12px] text-[#C2453C]">{error}</p>
      ) : (
        <p className="text-[12px] text-[var(--hint)]">
          사진을 올리면 시공 · 제품 · 주제 중 맞는 형식을 자동으로 골라 드립니다. 평균 1분 48초.
        </p>
      )}
    </div>
  );
}
