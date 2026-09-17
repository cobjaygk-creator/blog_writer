"use client";

import { ArrowRight, Check, Clock, ImageIcon, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type SourceItem = { id: string; title: string | null; chars: number };

type Traits = {
  sentenceLength: string;
  closerStyle: string;
  commonPhrases: string[];
  structureNotes: string;
};

const TOTAL_STEPS = 3;

function TraitCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] p-[14px_15px]">
      <span className="text-[11.5px] font-semibold text-[#9C9CA6]">{label}</span>
      <span className="text-[14px] font-semibold text-[var(--foreground)]">{value}</span>
    </div>
  );
}

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1 — voice name + source posts
  const [brandId, setBrandId] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [learnBusy, setLearnBusy] = useState(false);
  const [learnError, setLearnError] = useState<string | null>(null);

  // Step 2 — learned traits + generated sample
  const [learnSeconds, setLearnSeconds] = useState(0);
  const [traits, setTraits] = useState<Traits | null>(null);
  const [sampleSentence, setSampleSentence] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);

  // Step 3 — first post
  const [topic, setTopic] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Real elapsed time for the "학습 완료 · {n}초" badge — ticks while learning runs.
  useEffect(() => {
    if (!learnBusy) return;
    const id = setInterval(() => setLearnSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [learnBusy]);

  async function ensureBrand(): Promise<string> {
    if (brandId) return brandId;
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: brandName.trim() || "내 말투" }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      brand?: { id: string };
    };
    if (!res.ok || !data.brand?.id) throw new Error(data.error || "말투를 만들지 못했습니다.");
    setBrandId(data.brand.id);
    return data.brand.id;
  }

  async function addSource() {
    if (addBusy) return;
    if (!pasteText.trim() && !pasteUrl.trim()) {
      setAddError("원문을 붙여넣거나 URL을 입력해 주세요.");
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const id = await ensureBrand();
      const res = await fetch(`/api/brands/${id}/source-posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pasteUrl.trim() ? { url: pasteUrl.trim() } : { rawText: pasteText.trim() },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sourcePost?: { id: string; title: string | null; rawText: string };
      };
      if (!res.ok || !data.sourcePost) throw new Error(data.error || "원문 등록에 실패했습니다.");
      setSources((prev) => [
        ...prev,
        {
          id: data.sourcePost!.id,
          title: data.sourcePost!.title,
          chars: data.sourcePost!.rawText.length,
        },
      ]);
      setPasteText("");
      setPasteUrl("");
      setShowAddForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "원문 등록에 실패했습니다.");
    } finally {
      setAddBusy(false);
    }
  }

  async function learnStyle() {
    if (learnBusy || sources.length === 0 || !brandId) return;
    setLearnBusy(true);
    setLearnError(null);
    setLearnSeconds(0);
    try {
      if (brandName.trim()) {
        await fetch(`/api/brands/${brandId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: brandName.trim() }),
        }).catch(() => undefined);
      }
      const res = await fetch(`/api/brands/${brandId}/style/learn`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        styleProfile?: { traitsJson: unknown };
      };
      if (!res.ok || !data.styleProfile) throw new Error(data.error || "말투 학습에 실패했습니다.");

      const t = data.styleProfile.traitsJson as Partial<Traits> & Record<string, unknown>;
      setTraits({
        sentenceLength: typeof t.sentenceLength === "string" ? t.sentenceLength : "정보 없음",
        closerStyle: typeof t.closerStyle === "string" ? t.closerStyle : "정보 없음",
        commonPhrases: Array.isArray(t.commonPhrases)
          ? (t.commonPhrases as string[]).filter((v) => typeof v === "string")
          : [],
        structureNotes: typeof t.structureNotes === "string" ? t.structureNotes : "정보 없음",
      });
      setStep(2);
      void loadSample(brandId);
    } catch (e) {
      setLearnError(e instanceof Error ? e.message : "말투 학습에 실패했습니다.");
    } finally {
      setLearnBusy(false);
    }
  }

  async function loadSample(id: string) {
    setSampleBusy(true);
    setSampleSentence(null);
    try {
      const res = await fetch(`/api/brands/${id}/style/sample`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { sentence?: string };
      setSampleSentence(data.sentence || null);
    } catch {
      setSampleSentence(null);
    } finally {
      setSampleBusy(false);
    }
  }

  async function createFirstPost() {
    if (createBusy || !topic.trim()) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, mode: "worklog", keyword: topic.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        post?: { id: string };
      };
      if (!res.ok || !data.post?.id) throw new Error(data.error || "글을 만들지 못했습니다.");
      const postId = data.post.id;
      if (shot) {
        const form = new FormData();
        form.set("file", shot);
        form.set("autoCaption", "true");
        await fetch(`/api/posts/${postId}/images`, { method: "POST", body: form }).catch(
          () => undefined,
        );
      }
      router.push(`/posts/${postId}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "글을 만들지 못했습니다.");
      setCreateBusy(false);
    }
  }

  async function copyMobileLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/m/new`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
    }
  }

  const topicChips = sources
    .map((s) => s.title)
    .filter((t): t is string => Boolean(t?.trim()))
    .slice(0, 4);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[760px] items-center justify-center px-4 py-10">
      <div className="flex w-full flex-col overflow-hidden rounded-[14px] border border-[var(--border-strong)] bg-white shadow-[0_12px_32px_rgba(22,22,26,.09)]">
        <div className="flex h-[60px] shrink-0 items-center gap-3 px-[26px]">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-[var(--accent)] text-[11.5px] font-bold text-white">
            Di
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-[6px] w-[26px] rounded-full",
                  i + 1 <= step ? "bg-[var(--accent)]" : "bg-[#EDEDF1]",
                )}
              />
            ))}
          </div>
          <span className="text-[12px] font-semibold text-[var(--hint)] [font-variant-numeric:tabular-nums]">
            {step} / {TOTAL_STEPS}
          </span>
        </div>

        {step === 1 ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-[18px] px-[46px] pt-3.5">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-[25px] font-bold tracking-[-.025em] text-[var(--foreground)]">
                  어떤 말투로 써 드릴까요?
                </h2>
                <p className="text-[14px] leading-[1.6] text-[#6B6B75]">
                  지금까지 쓰신 블로그 글 2~3편만 붙여넣으세요. 그 글의 어투와 호흡을 그대로 따라
                  씁니다.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[12.5px] font-semibold text-[#6B6B75]">이 말투의 이름</span>
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="예: 한빛인테리어"
                  className="h-[46px] rounded-[11px] border border-[#E0E0E6] px-3.5 text-[15px] font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-[#6B6B75]">
                    내가 쓴 글 붙여넣기
                  </span>
                  {sources.length > 0 ? (
                    <span className="flex h-5 items-center rounded-[5px] bg-[#E7F5EF] px-2 text-[10.5px] font-bold text-[#0F7B52]">
                      {sources.length}편 등록됨
                    </span>
                  ) : null}
                  <span className="ml-auto text-[12px] text-[var(--hint)]">
                    최소 1편, 3편 권장
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {sources.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2.5 rounded-[11px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3"
                    >
                      <Check className="h-[17px] w-[17px] shrink-0 text-[#0F7B52]" strokeWidth={2.2} />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-[13.5px] font-semibold text-[var(--foreground)]">
                          {s.title || "(제목 없음)"}
                        </span>
                        <span className="text-[11.5px] text-[#9C9CA6] [font-variant-numeric:tabular-nums]">
                          {s.chars.toLocaleString()}자
                        </span>
                      </div>
                    </div>
                  ))}

                  {showAddForm ? (
                    <div className="flex flex-col gap-2 rounded-[11px] border border-[var(--accent)] p-3">
                      <textarea
                        value={pasteText}
                        onChange={(e) => {
                          setPasteText(e.target.value);
                          if (e.target.value) setPasteUrl("");
                        }}
                        rows={3}
                        placeholder="블로그 글 본문을 여기에 붙여넣으세요 (20자 이상)"
                        className="resize-none border-0 bg-transparent p-0 text-[13.5px] leading-[1.5] text-[var(--foreground)] outline-none placeholder:text-[var(--hint)]"
                      />
                      <div className="h-px bg-[#F0F0F3]" />
                      <div className="flex items-center gap-2">
                        <span className="text-[11.5px] text-[var(--hint)]">또는 URL</span>
                        <input
                          value={pasteUrl}
                          onChange={(e) => {
                            setPasteUrl(e.target.value);
                            if (e.target.value) setPasteText("");
                          }}
                          placeholder="blog.naver.com/..."
                          className="h-8 flex-1 rounded-[8px] border border-[var(--border)] px-2.5 text-[12.5px] outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                      {addError ? <p className="text-[11.5px] text-[#C2453C]">{addError}</p> : null}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddForm(false);
                            setAddError(null);
                          }}
                          className="flex h-8 items-center rounded-[8px] px-3 text-[12.5px] font-semibold text-[#8A8A94]"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void addSource()}
                          disabled={addBusy}
                          className="flex h-8 items-center rounded-[8px] bg-[var(--accent)] px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
                        >
                          {addBusy ? "추가하는 중…" : "이 글 추가"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddForm(true)}
                      className="flex items-center justify-center gap-2 rounded-[11px] border border-dashed border-[#D4D4DB] bg-white py-[15px] text-[13.5px] font-semibold text-[#8A8A94] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.2} />
                      글 붙여넣기 · URL로 가져오기
                    </button>
                  )}
                </div>
              </div>
            </div>

            {learnError ? (
              <p className="px-[46px] pb-2 pt-3 text-[12px] text-[#C2453C]">{learnError}</p>
            ) : (
              <div className="pt-3" />
            )}

            <div className="flex h-[78px] shrink-0 items-center gap-3 border-t border-[#F0F0F3] px-[46px]">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="text-[13px] font-semibold text-[#8A8A94]"
              >
                먼저 둘러볼게요
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => void learnStyle()}
                disabled={sources.length === 0 || learnBusy}
                className="flex h-[46px] items-center gap-2 rounded-[11px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(75,59,255,.35)] disabled:opacity-50"
              >
                {learnBusy ? "학습하는 중…" : "말투 학습하기"}
                {!learnBusy ? <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2} /> : null}
              </button>
            </div>
          </>
        ) : step === 2 ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[46px] pb-4 pt-3.5">
              <div className="flex flex-col gap-1.5">
                <span className="flex h-6 w-fit items-center gap-1.5 rounded-[7px] bg-[#E7F5EF] px-2.5 text-[11.5px] font-bold text-[#0F7B52]">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                  학습 완료 · {Math.max(1, learnSeconds)}초
                </span>
                <h2 className="text-[25px] font-bold tracking-[-.025em] text-[var(--foreground)]">
                  이렇게 쓰시는 분이군요
                </h2>
                <p className="text-[14px] leading-[1.6] text-[#6B6B75]">
                  {sources.length}편에서 찾아낸 말투 특징입니다. 틀린 게 있으면 지금 지워 주세요 —
                  앞으로 쓰는 모든 글에 적용됩니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <TraitCard label="문장 길이" value={traits?.sentenceLength ?? "—"} />
                <TraitCard label="맺음말" value={traits?.closerStyle ?? "—"} />
                <TraitCard
                  label="자주 쓰는 표현"
                  value={
                    traits?.commonPhrases?.length ? traits.commonPhrases.slice(0, 4).join(", ") : "—"
                  }
                />
                <TraitCard label="글 구조" value={traits?.structureNotes ?? "—"} />
              </div>

              <div className="flex flex-col gap-2 rounded-[12px] border border-[#D9D4FF] bg-[#F7F6FF] p-[15px_16px]">
                <span className="text-[12px] font-bold text-[var(--accent)]">
                  이 말투로 쓰면 이런 문장이 나옵니다
                </span>
                <p className="text-[14px] leading-[1.7] text-[#3A3A44]">
                  {sampleBusy ? "예시 문장을 쓰는 중…" : sampleSentence || "예시를 불러오지 못했습니다."}
                </p>
              </div>

              <div className="flex items-center gap-2.5 rounded-[12px] border border-[#F0F0F3] bg-[var(--surface-2)] px-[15px] py-3">
                <Clock className="h-4 w-4 shrink-0 text-[var(--hint)]" strokeWidth={1.8} />
                <span className="text-[12.5px] text-[#6B6B75]">
                  글을 올릴 때마다 말투는 계속 정교해집니다. 지금은{" "}
                  <strong className="font-semibold">{sources.length}편 기준</strong>입니다.
                </span>
              </div>
            </div>

            <div className="flex h-[78px] shrink-0 items-center gap-3 border-t border-[#F0F0F3] px-[46px]">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex h-[46px] items-center rounded-[11px] border border-[#E0E0E6] px-[18px] text-[14px] font-semibold text-[#3A3A44]"
              >
                글 더 넣기
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex h-[46px] items-center gap-2 rounded-[11px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(75,59,255,.35)]"
              >
                맞습니다, 계속
                <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-[46px] pb-6 pt-3.5">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[25px] font-bold tracking-[-.025em] text-[var(--foreground)]">
                첫 글, 바로 만들어 봅시다
              </h2>
              <p className="text-[14px] leading-[1.6] text-[#6B6B75]">
                한 줄만 적으면 됩니다. 마음에 안 들면 다시 써도 됩니다.
              </p>
            </div>

            <div className="flex flex-col gap-3.5 rounded-[16px] border border-[#E0E0E6] p-[18px] shadow-[0_2px_10px_rgba(22,22,26,.05)]">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-[21px] w-[21px] shrink-0 text-[var(--accent)]" strokeWidth={1.7} />
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void createFirstPost();
                    }
                  }}
                  rows={1}
                  placeholder="무엇에 대해 쓸까요?"
                  className="min-h-[26px] flex-1 resize-none border-0 bg-transparent p-0 text-[17px] font-medium leading-[1.5] text-[var(--foreground)] outline-none placeholder:font-normal placeholder:text-[var(--hint)]"
                />
              </div>
              <div className="h-px bg-[#F0F0F3]" />
              <div className="flex items-center gap-3">
                <label className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-[11px] border border-dashed border-[#D4D4DB] bg-[var(--surface-2)] px-3.5 py-2.5">
                  <ImageIcon className="h-[17px] w-[17px] shrink-0 text-[var(--hint)]" strokeWidth={1.7} />
                  <span className="truncate text-[12.5px] text-[#8A8A94]">
                    {shot ? shot.name : "사진 (선택)"}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setShot(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void createFirstPost()}
                  disabled={!topic.trim() || createBusy}
                  className={cn(
                    "flex h-[46px] shrink-0 items-center gap-2 rounded-[11px] px-[22px] text-[14.5px] font-semibold transition-colors",
                    topic.trim()
                      ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                      : "bg-[#EDEDF1] text-[var(--hint)]",
                  )}
                >
                  {createBusy ? "만드는 중…" : "글 만들기"}
                </button>
              </div>
              {createError ? <p className="text-[12px] text-[#C2453C]">{createError}</p> : null}
            </div>

            {topicChips.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-[12.5px] font-semibold text-[#9C9CA6]">
                  이런 주제로 많이 쓰십니다 — 눌러서 바로 시작
                </span>
                <div className="flex flex-wrap gap-2">
                  {topicChips.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTopic(t)}
                      className="flex h-9 items-center rounded-full border border-[var(--border)] px-3.5 text-[13px] font-medium text-[#3A3A44] hover:border-[var(--accent)]"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-auto flex items-center gap-3 rounded-[12px] border border-[#F0F0F3] bg-[var(--surface-2)] px-[15px] py-[13px]">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--border)] bg-white text-[#6B6B75]">
                <ImageIcon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span className="text-[12.5px] leading-[1.5] text-[#6B6B75]">
                현장에서 찍은 사진이 있다면 <strong className="font-semibold">휴대폰으로</strong>{" "}
                쓰는 게 훨씬 빠릅니다.
              </span>
              <button
                type="button"
                onClick={() => void copyMobileLink()}
                className="ml-auto flex h-8 shrink-0 items-center rounded-[9px] border border-[var(--border-strong)] bg-white px-3.5 text-[12.5px] font-semibold text-[#3A3A44]"
              >
                {linkCopied ? "복사됨" : "링크 복사"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
