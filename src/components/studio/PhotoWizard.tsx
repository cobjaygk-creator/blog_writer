"use client";

import { ArrowRight, GripVertical, Image as ImageIcon, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { GeneratingOverlay } from "@/components/studio/wizard/GeneratingOverlay";
import { WizardShell } from "@/components/studio/wizard/WizardShell";
import { USE_DEFAULT_THEME_ID } from "@/lib/default-theme";
import { createAndGeneratePost } from "@/lib/run-generation-job-client";
import { TOPIC_LENGTH_PRESETS, TOPIC_LENGTHS, type TopicLength } from "@/lib/topic-length";
import { cn } from "@/lib/utils";

type Voice = { id: string; name: string; version: number | null };
type Photo = { file: File; url: string; caption: string };

const STEPS = ["photos", "topic", "voice", "length", "confirm"] as const;

export function PhotoWizard({ voices }: { voices: Voice[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [topic, setTopic] = useState("");
  const [voiceId, setVoiceId] = useState<string>(voices[0]?.id ?? USE_DEFAULT_THEME_ID);
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

  const stepId = STEPS[step];
  const canNext = stepId === "photos" ? photos.length > 0 : true;

  function back() {
    if (step === 0) {
      router.push("/dashboard");
      return;
    }
    setStep((s) => s - 1);
  }

  function next() {
    if (!canNext) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const postId = await createAndGeneratePost({
        createBody: {
          brandId: voiceId === USE_DEFAULT_THEME_ID ? null : voiceId,
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

  const voiceName = voices.find((v) => v.id === voiceId)?.name || "기본 테마";
  const lengthLabel = TOPIC_LENGTH_PRESETS[length].label;

  const footer =
    stepId === "confirm" ? (
      <>
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          className="h-11 shrink-0 px-2 text-[13px] font-semibold text-[#8A8A94]"
        >
          이전
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="flex h-11 shrink-0 items-center gap-2 rounded-[11px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(0,100,255,.35)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {busy ? "만드는 중…" : "초안 만들기"}
        </button>
      </>
    ) : (
      <>
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="h-11 shrink-0 px-2 text-[13px] font-semibold text-[#8A8A94]"
          >
            이전
          </button>
        ) : (
          <span />
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={next}
          disabled={!canNext}
          className="flex h-11 shrink-0 items-center gap-2 rounded-[11px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(0,100,255,.35)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-[#EDEDF1] disabled:text-[var(--hint)] disabled:shadow-none"
        >
          다음
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </>
    );

  return (
    <>
      {busy ? <GeneratingOverlay label={genLabel || "준비하는 중…"} pct={genPct} /> : null}
      <WizardShell
        title="현장 사진으로"
        stepIndex={step}
        stepCount={STEPS.length}
        onBack={back}
        footer={footer}
      >
        {stepId === "photos" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold tracking-[-.02em] text-[var(--foreground)]">
                사진을 올려 주세요
              </h2>
              <p className="text-[13.5px] text-[var(--muted)]">순서는 끌어서 바꿀 수 있어요.</p>
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
                "flex cursor-pointer items-center gap-2.5 rounded-[14px] border border-dashed bg-[var(--surface-2)] px-4 py-4 transition-colors",
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
          </div>
        ) : null}

        {stepId === "topic" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold tracking-[-.02em] text-[var(--foreground)]">
                무슨 작업이었나요?
              </h2>
              <p className="text-[13.5px] text-[var(--muted)]">한 줄이면 됩니다 · 없어도 괜찮아요</p>
            </div>
            <textarea
              autoFocus
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={2}
              placeholder="예: 욕실 방수 재시공"
              className="min-h-[64px] resize-none rounded-[14px] border-[1.5px] border-[var(--accent)] bg-white px-4 py-3 text-[17px] font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--hint)]"
            />
          </div>
        ) : null}

        {stepId === "voice" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold tracking-[-.02em] text-[var(--foreground)]">
                어떤 말투로 쓸까요?
              </h2>
              <p className="text-[13.5px] text-[var(--muted)]">나중에 언제든 바꿀 수 있어요.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {voices.map((v) => {
                const selected = v.id === voiceId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoiceId(v.id)}
                    className={cn(
                      "flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] transition-colors",
                      selected
                        ? "border border-[#D9D4FF] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                        : "border border-[var(--border)] bg-white font-medium text-[var(--muted)] hover:border-[var(--border-strong)]",
                    )}
                  >
                    {v.name}
                    {v.version != null ? (
                      <span className="text-[11px] font-bold opacity-75">v{v.version}</span>
                    ) : null}
                  </button>
                );
              })}
              <Link
                href="/brands/new"
                className="flex h-11 items-center gap-1 rounded-full border border-dashed border-[#D4D4DB] bg-white px-4 text-[14px] font-medium text-[#8A8A94] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />새 말투
              </Link>
            </div>
          </div>
        ) : null}

        {stepId === "length" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold tracking-[-.02em] text-[var(--foreground)]">
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
          </div>
        ) : null}

        {stepId === "confirm" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold tracking-[-.02em] text-[var(--foreground)]">
                이대로 만들까요?
              </h2>
            </div>
            <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--border)] bg-white p-4">
              <SummaryRow label="사진" value={`${photos.length}장`} onEdit={() => setStep(0)} />
              <SummaryRow label="작업" value={topic || "(없음)"} onEdit={() => setStep(1)} />
              <SummaryRow label="말투" value={voiceName} onEdit={() => setStep(2)} />
              <SummaryRow label="글 길이" value={lengthLabel} onEdit={() => setStep(3)} />
            </div>
            {error ? <p className="text-[12px] text-[#C2453C]">{error}</p> : null}
          </div>
        ) : null}
      </WizardShell>
    </>
  );
}

function SummaryRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[12.5px] font-semibold text-[var(--faint)]">{label}</span>
      <span className="flex-1 truncate text-[14px] text-[var(--foreground)]">{value}</span>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-[12px] font-semibold text-[var(--accent)]"
      >
        수정
      </button>
    </div>
  );
}
