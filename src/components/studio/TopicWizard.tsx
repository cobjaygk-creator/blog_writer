"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

const SUGGESTED_TOPICS = ["오늘 진행한 현장 후기", "신메뉴·신상품 소개", "자주 묻는 질문 정리"];

const STEPS = ["topic", "voice", "length", "confirm"] as const;

export function TopicWizard({ voices }: { voices: Voice[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState("");
  const [voice, setVoice] = useState<VoiceSelection>(() => defaultVoiceSelection(voices));
  const [length, setLength] = useState<TopicLength>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genLabel, setGenLabel] = useState("");
  const [genPct, setGenPct] = useState(0);

  const stepId = STEPS[step];
  const canNext =
    stepId === "topic" ? topic.trim().length > 0 : stepId === "voice" || stepId === "length";

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
          brandId: voiceSelectionBrandId(voice),
          captionTone: voiceSelectionCaptionTone(voice),
          mode: "topic",
          keyword: topic.trim(),
        },
        jobBody: {
          kind: "generate_topic",
          topic: topic.trim(),
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
        title="주제만 정해서"
        stepIndex={step}
        stepCount={STEPS.length}
        onBack={back}
        footer={footer}
      >
        {stepId === "topic" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold tracking-[-.02em] text-[var(--foreground)]">
                어떤 주제로 쓸까요?
              </h2>
              <p className="text-[13.5px] text-[var(--muted)]">한 줄이면 충분합니다.</p>
            </div>
            <textarea
              autoFocus
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  next();
                }
              }}
              rows={2}
              placeholder="예: 신메뉴 밤 라떼 소개"
              className="min-h-[64px] resize-none rounded-[14px] border-[1.5px] border-[var(--accent)] bg-white px-4 py-3 text-[17px] font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--hint)]"
            />
            <div className="flex flex-col gap-2">
              <span className="text-[12.5px] font-semibold text-[var(--faint)]">
                이런 주제로 많이 쓰십니다
              </span>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TOPICS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTopic(t)}
                    className="flex h-9 items-center rounded-full border border-[var(--border)] bg-white px-3.5 text-[13px] font-medium text-[#3A3A44] hover:border-[var(--border-strong)]"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
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
            <VoiceStep voices={voices} value={voice} onChange={setVoice} />
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
              <SummaryRow label="주제" value={topic} onEdit={() => setStep(0)} />
              <SummaryRow label="말투" value={voiceName} onEdit={() => setStep(1)} />
              <SummaryRow label="글 길이" value={lengthLabel} onEdit={() => setStep(2)} />
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
