"use client";

import { ChevronLeft, GripVertical, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { USE_DEFAULT_THEME_ID } from "@/lib/default-theme";
import { cn } from "@/lib/utils";

type Voice = { id: string; name: string; version: number | null };

/** `auto` = caption still the generated default (not user-edited). */
type Shot = { file: File; url: string; caption: string; auto: boolean };

function defaultCaption(line: string, index: number) {
  const t = line.trim();
  return t ? `${t} · 사진 ${index + 1}` : `현장 사진 ${index + 1}`;
}

export function MobileCompose({
  voices,
  usedThisMonth,
  monthlyLimit,
  topicOnly = false,
}: {
  voices: Voice[];
  usedThisMonth: number;
  monthlyLimit: string;
  topicOnly?: boolean;
}) {
  const router = useRouter();
  const [shots, setShots] = useState<Shot[]>([]);
  const [line, setLine] = useState("");
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? USE_DEFAULT_THEME_ID);
  const [autoCaption, setAutoCaption] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shotsRef = useRef<Shot[]>([]);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);
  useEffect(
    () => () => {
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    },
    [],
  );

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ file, url: URL.createObjectURL(file), caption: "", auto: true }));
    if (next.length) setShots((prev) => [...prev, ...next]);
  }

  function setCaption(index: number, value: string) {
    setShots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, caption: value, auto: false } : s)),
    );
  }

  function removeShot(index: number) {
    setShots((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function reorder(from: number, to: number) {
    setShots((prev) => {
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
    if (!line.trim()) {
      setError("무슨 작업이었는지 한 줄만 적어 주세요.");
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
          keyword: line.trim(),
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

      for (const shot of shots) {
        // Untouched (auto) captions are left to the server's vision pass.
        const manual = shot.auto ? "" : shot.caption.trim();
        const form = new FormData();
        form.set("file", shot.file);
        form.set("autoCaption", manual ? "false" : autoCaption ? "true" : "false");
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

      router.replace(`/m/g/${postId}?kw=${encodeURIComponent(line.trim())}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "글을 만들지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-white pb-[140px]">
      <div className="flex h-[54px] items-center justify-between border-b border-[#F0F0F3] px-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center text-[var(--foreground)]"
          aria-label="뒤로"
        >
          <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2} />
        </button>
        <span className="text-[15px] font-bold text-[var(--foreground)]">
          {shots.length > 0 ? `사진 ${shots.length}장` : "새 글"}
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-9 min-w-9 items-center justify-center px-1 text-[13.5px] font-semibold text-[var(--accent)]"
        >
          추가
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-col gap-4 px-5 pt-4">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-[#6B6B75]">
            무슨 작업이었나요? <span className="font-normal text-[#B4B4BE]">한 줄이면 됩니다</span>
          </span>
          <div className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-[var(--accent)] p-3.5">
            <textarea
              value={line}
              onChange={(e) => setLine(e.target.value)}
              rows={2}
              placeholder="예: 아파트 욕실 방수 이틀차, 양생 확인"
              className="resize-none border-0 bg-transparent p-0 text-[16px] font-medium leading-[1.5] text-[var(--foreground)] outline-none placeholder:font-normal placeholder:text-[var(--hint)]"
            />
            <div className="flex flex-wrap gap-2">
              {voices.map((v) => {
                const selected = v.id === voiceId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoiceId(v.id)}
                    className={cn(
                      "flex h-[34px] items-center gap-1 rounded-full px-3 text-[12.5px] transition-colors",
                      selected
                        ? "border border-[#D9D4FF] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                        : "border border-[var(--border)] bg-white font-medium text-[var(--muted)]",
                    )}
                  >
                    {v.name}
                    {v.version != null ? (
                      <span className="text-[10px] font-bold opacity-75">v{v.version}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {shots.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-[12px] border border-dashed border-[#D4D4DB] bg-[var(--surface-2)] px-4 py-4 text-center">
            <p className="text-[12.5px] text-[#8A8A94]">
              {topicOnly
                ? "사진 없이 주제만으로 쓰는 중이에요."
                : "사진 없이 시작해도 됩니다."}
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-[12.5px] font-semibold text-[var(--accent)]"
            >
              현장 사진 추가하기
            </button>
          </div>
        ) : null}

        {shots.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-[var(--foreground)]">사진 순서</span>
              <span className="text-[12px] text-[#B4B4BE]">길게 눌러 옮기기</span>
              <button
                type="button"
                onClick={() => setAutoCaption((v) => !v)}
                className={cn(
                  "ml-auto flex h-[26px] items-center gap-1 rounded-[7px] px-2 text-[11.5px] font-semibold transition-colors",
                  autoCaption
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "bg-[#F0F0F3] text-[#8A8A94]",
                )}
                aria-pressed={autoCaption}
              >
                <Sparkles className="h-[13px] w-[13px]" strokeWidth={1.9} />
                설명 자동
              </button>
            </div>
            <div className="grid grid-cols-2 gap-[9px]">
              {shots.map((shot, i) => (
                <div
                  key={shot.url}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) reorder(dragIndex, i);
                    setDragIndex(null);
                  }}
                  className={cn(
                    "relative overflow-hidden rounded-[12px] border transition-colors",
                    dragIndex === i && "opacity-40",
                    dragIndex !== null && dragIndex !== i
                      ? "border-[var(--accent)]"
                      : "border-[var(--border)]",
                  )}
                >
                  <div
                    draggable={!busy}
                    onDragStart={() => setDragIndex(i)}
                    onDragEnd={() => setDragIndex(null)}
                    className="relative h-24 cursor-grab bg-[var(--surface-2)] active:cursor-grabbing"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shot.url}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                    <span className="absolute left-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-[rgba(22,22,26,.72)] text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="absolute bottom-1.5 left-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-[rgba(22,22,26,.55)] text-white">
                      <GripVertical className="h-3 w-3" strokeWidth={1.8} />
                    </span>
                    <button
                      type="button"
                      onClick={() => removeShot(i)}
                      className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[rgba(22,22,26,.6)] text-white"
                      aria-label={`${i + 1}번 사진 빼기`}
                    >
                      <X className="h-3 w-3" strokeWidth={2.4} />
                    </button>
                  </div>
                  <input
                    value={shot.auto ? defaultCaption(line, i) : shot.caption}
                    onChange={(e) => setCaption(i, e.target.value)}
                    placeholder="이 사진 설명"
                    className={cn(
                      "w-full border-0 border-t border-[#F0F0F3] bg-transparent px-2.5 py-2.5 text-[11.5px] outline-none placeholder:text-[#B4B4BE] focus:bg-[var(--accent-soft)]",
                      shot.auto ? "text-[#B4B4BE]" : "text-[#6B6B75]",
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="text-[12.5px] text-[#C2453C]">{error}</p> : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[480px] border-t border-[#F0F0F3] bg-white px-5 pb-[26px] pt-3.5">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="flex h-14 w-full items-center justify-center rounded-[15px] bg-[var(--accent)] text-[16px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? "초안 준비 중…" : "초안 만들기"}
        </button>
        <p className="pt-2 text-center text-[11.5px] text-[#B4B4BE] [font-variant-numeric:tabular-nums]">
          약 1분 50초 · 이번 달 {usedThisMonth}/{monthlyLimit}
        </p>
      </div>
    </main>
  );
}
