"use client";

import { ArrowRight, GripVertical, Image as ImageIcon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AccordionField } from "@/components/studio/wizard/AccordionField";
import { GeneratingOverlay } from "@/components/studio/wizard/GeneratingOverlay";
import {
  VoiceStep,
  defaultVoiceSelection,
  voiceSelectionBrandId,
  voiceSelectionCaptionTone,
  voiceSelectionLabel,
  type Voice,
  type VoiceSelection,
} from "@/components/studio/wizard/VoiceStep";
import { WizardShell } from "@/components/studio/wizard/WizardShell";
import { createAndGeneratePost } from "@/lib/run-generation-job-client";
import { TOPIC_LENGTH_PRESETS, TOPIC_LENGTHS, type TopicLength } from "@/lib/topic-length";
import { cn } from "@/lib/utils";

type Photo = { file: File; url: string; caption: string };

const FIELDS = ["photos", "topic", "voice", "length"] as const;

function fieldState(index: number, step: number): "done" | "active" | "pending" {
  if (index < step) return "done";
  if (index === step) return "active";
  return "pending";
}

export function PhotoWizard({ voices }: { voices: Voice[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [topic, setTopic] = useState("");
  const [voice, setVoice] = useState<VoiceSelection>(() => defaultVoiceSelection(voices));
  const [length, setLength] = useState<TopicLength>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genLabel, setGenLabel] = useState("");
  const [genPct, setGenPct] = useState(0);
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
      .map((file) => ({ file, url: URL.createObjectURL(file), caption: "" }));
    if (next.length) setPhotos((prev) => [...prev, ...next]);
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

  const done = step >= FIELDS.length;

  function back() {
    if (step === 0) {
      router.push("/dashboard");
      return;
    }
    setStep((s) => s - 1);
  }

  function next() {
    setStep((s) => Math.min(s + 1, FIELDS.length));
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const postId = await createAndGeneratePost({
        createBody: {
          brandId: voiceSelectionBrandId(voice),
          captionTone: voiceSelectionCaptionTone(voice),
          mode: "worklog",
          keyword: topic.trim() || undefined,
        },
        photos: photos.map((p) => ({ file: p.file, caption: p.caption, auto: !p.caption.trim() })),
        jobBody: {
          kind: "generate",
          keyword: topic.trim() || undefined,
          length,
        },
        onPhase: (label, pct) => {
          setGenLabel(label);
          setGenPct(pct);
        },
      });
      router.push(`/posts/${postId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "글을 만들지 못했습니다.");
      setBusy(false);
    }
  }

  const voiceName = voiceSelectionLabel(voice, voices);
  const lengthLabel = TOPIC_LENGTH_PRESETS[length].label;

  return (
    <>
      {busy ? <GeneratingOverlay label={genLabel || "준비하는 중…"} pct={genPct} /> : null}
      <WizardShell title="현장 사진으로" onBack={back}>
        <AccordionField
          label="사진"
          summary={`${photos.length}장`}
          state={fieldState(0, step)}
          onEdit={() => setStep(0)}
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[19px] font-bold tracking-[-.02em] text-[var(--foreground)]">
              사진을 올려 주세요
            </h2>
            <p className="text-[13px] text-[var(--muted)]">순서는 끌어서 바꿀 수 있어요.</p>
          </div>
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
              "flex cursor-pointer items-center gap-2.5 rounded-[12px] border border-dashed bg-[var(--surface-2)] px-4 py-3.5 transition-colors",
              dragOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[#D4D4DB]",
            )}
          >
            <ImageIcon className="h-5 w-5 shrink-0 text-[var(--hint)]" strokeWidth={1.7} />
            <span className="text-[13.5px] text-[#8A8A94]">
              현장 사진을 여기에 끌어다 놓거나 눌러서 추가
            </span>
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

          {photos.length > 0 ? (
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
                    "flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-white p-2 transition-colors",
                    dragIndex === i && "opacity-40",
                  )}
                >
                  <span
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragEnd={() => setDragIndex(null)}
                    className="flex h-12 w-5 shrink-0 cursor-grab items-center justify-center text-[var(--hint)] active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" draggable={false} />
                    <span className="absolute left-1 top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-[5px] bg-[rgba(22,22,26,.72)] px-1 text-[9.5px] font-bold text-white">
                      {i + 1}
                    </span>
                  </span>
                  <span className="flex-1 truncate text-[12.5px] text-[var(--muted)]">
                    {p.file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--faint)] hover:bg-[var(--surface-2)] hover:text-[#C2453C]"
                    aria-label={`${i + 1}번 사진 빼기`}
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={next}
            disabled={photos.length === 0}
            className="flex h-11 items-center justify-center gap-2 self-end rounded-[11px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(0,100,255,.35)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-[#EDEDF1] disabled:text-[var(--hint)] disabled:shadow-none"
          >
            다음
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </AccordionField>

        <AccordionField
          label="작업"
          summary={topic || "(없음)"}
          state={fieldState(1, step)}
          onEdit={() => setStep(1)}
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[19px] font-bold tracking-[-.02em] text-[var(--foreground)]">
              무슨 작업이었나요?
            </h2>
            <p className="text-[13px] text-[var(--muted)]">한 줄이면 됩니다 · 없어도 괜찮아요</p>
          </div>
          <textarea
            autoFocus
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="예: 욕실 방수 재시공"
            className="min-h-[56px] resize-none rounded-[12px] border border-[var(--border-strong)] bg-white px-3.5 py-2.5 text-[16px] font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--hint)] focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={next}
            className="flex h-11 items-center justify-center gap-2 self-end rounded-[11px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(0,100,255,.35)] hover:bg-[var(--accent-hover)]"
          >
            다음
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </AccordionField>

        <AccordionField
          label="말투"
          summary={voiceName}
          state={fieldState(2, step)}
          onEdit={() => setStep(2)}
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[19px] font-bold tracking-[-.02em] text-[var(--foreground)]">
              어떤 말투로 쓸까요?
            </h2>
          </div>
          <VoiceStep voices={voices} value={voice} onChange={setVoice} />
          <button
            type="button"
            onClick={next}
            className="flex h-11 items-center justify-center gap-2 self-end rounded-[11px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(0,100,255,.35)] hover:bg-[var(--accent-hover)]"
          >
            다음
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </AccordionField>

        <AccordionField
          label="글 길이"
          summary={lengthLabel}
          state={fieldState(3, step)}
          onEdit={() => setStep(3)}
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[19px] font-bold tracking-[-.02em] text-[var(--foreground)]">
              글 길이는요?
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {TOPIC_LENGTHS.map((id) => {
              const preset = TOPIC_LENGTH_PRESETS[id];
              const selected = length === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLength(id)}
                  className={cn(
                    "flex items-center justify-between rounded-[12px] border px-4 py-3.5 text-left transition-colors",
                    selected
                      ? "border-[#D9D4FF] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-white hover:border-[var(--border-strong)]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[14.5px] font-semibold",
                      selected ? "text-[var(--accent)]" : "text-[var(--foreground)]",
                    )}
                  >
                    {preset.label}
                  </span>
                  <span className="text-[12px] text-[var(--hint)]">{preset.hint}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={next}
            className="flex h-11 items-center justify-center gap-2 self-end rounded-[11px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(0,100,255,.35)] hover:bg-[var(--accent-hover)]"
          >
            다음
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </AccordionField>

        {done ? (
          <div className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-[var(--accent)] bg-white p-5 shadow-[0_2px_10px_rgba(22,22,26,.05)]">
            <h2 className="text-[19px] font-bold tracking-[-.02em] text-[var(--foreground)]">
              이대로 만들까요?
            </h2>
            {error ? <p className="text-[12px] text-[#C2453C]">{error}</p> : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[var(--accent)] text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(0,100,255,.35)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {busy ? "만드는 중…" : "초안 만들기"}
            </button>
          </div>
        ) : null}
      </WizardShell>
    </>
  );
}
