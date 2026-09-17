"use client";

import { ArrowRight, Check, Link as LinkIcon, Plus } from "lucide-react";
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

type Preview = {
  title: string | null;
  sourceUrl: string;
  charCount: number;
  paragraphCount: number;
  imageCount: number;
  sections: string[];
  topics: string[];
};

function fmtNumber(n: number) {
  return n.toLocaleString("ko-KR");
}

function isUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

const STEPS = ["url", "topic", "voice", "length", "confirm"] as const;

export function ReferenceWizard({
  initialUrl,
  voices,
}: {
  initialUrl: string;
  voices: Voice[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const [topic, setTopic] = useState("");
  const [voiceId, setVoiceId] = useState<string>(voices[0]?.id ?? USE_DEFAULT_THEME_ID);
  const [length, setLength] = useState<TopicLength>("medium");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genLabel, setGenLabel] = useState("");
  const [genPct, setGenPct] = useState(0);

  async function readUrl(target: string) {
    if (!isUrl(target)) return;
    setLoading(true);
    setReadError(null);
    try {
      const res = await fetch("/api/reference/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Preview> & { error?: string };
      if (!res.ok) throw new Error(data.error || "글을 읽지 못했습니다.");
      setPreview(data as Preview);
    } catch (e) {
      setPreview(null);
      setReadError(e instanceof Error ? e.message : "글을 읽지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const triedRef = useRef(false);
  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;
    if (!isUrl(initialUrl)) return;
    const timer = setTimeout(() => void readUrl(initialUrl), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepId = STEPS[step];
  const canNext = stepId === "url" ? Boolean(preview) && !loading : true;

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
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const postId = await createAndGeneratePost({
        createBody: {
          brandId: voiceId === USE_DEFAULT_THEME_ID ? null : voiceId,
          mode: "worklog",
          keyword: topic.trim() || undefined,
          referenceUrl: preview.sourceUrl,
        },
        jobBody: {
          kind: "generate_reference",
          referenceUrl: preview.sourceUrl,
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
        title="이 글처럼"
        stepIndex={step}
        stepCount={STEPS.length}
        onBack={back}
        footer={footer}
      >
        {stepId === "url" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold tracking-[-.02em] text-[var(--foreground)]">
                참고할 글 주소를 알려주세요
              </h2>
              <p className="text-[13.5px] text-[var(--muted)]">
                구조와 흐름만 참고하고, 문장은 내 말투로 새로 씁니다.
              </p>
            </div>
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
                autoFocus
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setPreview(null);
                }}
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
                  disabled={loading || !isUrl(url)}
                  className="shrink-0 text-[12.5px] font-semibold text-[var(--accent)] disabled:opacity-50"
                >
                  {loading ? "읽는 중…" : "읽기"}
                </button>
              )}
            </div>
            {readError ? <p className="text-[12px] text-[#C2453C]">{readError}</p> : null}

            {preview ? (
              <div className="flex flex-col gap-[13px] rounded-[14px] border border-[var(--border)] bg-white p-[17px_18px]">
                <div className="flex items-center justify-between">
                  <span className="text-[13.5px] font-bold text-[var(--foreground)]">이 글의 구성</span>
                  <span className="[font-variant-numeric:tabular-nums] text-[11.5px] text-[var(--hint)]">
                    {fmtNumber(preview.charCount)}자 · 사진 {preview.imageCount}
                  </span>
                </div>
                {preview.title ? (
                  <p className="text-[14px] font-semibold leading-[1.5] text-[var(--foreground)]">
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

            <div className="flex flex-col gap-[7px] rounded-[11px] border border-[#F0DFB4] bg-[#FDF9EE] px-[13px] py-3">
              <span className="text-[12px] font-bold text-[#6B4E10]">가져오지 않는 것</span>
              <ul className="flex flex-col gap-0.5 text-[11.5px] leading-[1.5] text-[#8A6410]">
                <li>· 문장과 표현 — 전부 새로 씁니다</li>
                <li>· 사진 — 원저작자의 것입니다</li>
                <li>· 상호 · 가격 · 연락처</li>
              </ul>
            </div>
          </div>
        ) : null}

        {stepId === "topic" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold tracking-[-.02em] text-[var(--foreground)]">
                내가 쓸 주제는요?
              </h2>
              <p className="text-[13.5px] text-[var(--muted)]">
                같은 구조로, 내 현장 이야기로 — 없어도 괜찮아요
              </p>
            </div>
            <textarea
              autoFocus
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={2}
              placeholder="어떤 이야기로 쓸지 적어 주세요"
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
              <SummaryRow label="참고 글" value={preview?.title || url} onEdit={() => setStep(0)} />
              <SummaryRow label="주제" value={topic || "(없음)"} onEdit={() => setStep(1)} />
              <SummaryRow label="말투" value={voiceName} onEdit={() => setStep(2)} />
              <SummaryRow label="글 길이" value={lengthLabel} onEdit={() => setStep(3)} />
            </div>
            <p className="text-center text-[11.5px] text-[var(--hint)]">
              참고한 글은 발행 기록에 함께 남습니다
            </p>
            {error ? <p className="text-center text-[12px] text-[#C2453C]">{error}</p> : null}
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
