"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { phaseProgressRange } from "@/lib/generation-progress";
import { phaseStatusLabel } from "@/lib/post-generate-job-ui";
import {
  type ClientJob,
  resumeActiveGenerationJob,
  runGenerationJobClient,
} from "@/lib/run-generation-job-client";

const PHASE_RANK: Record<string, number> = {
  pending: 0,
  assemble: 1,
  draft: 2,
  draft_gpt: 2,
  draft_gemini: 2,
  style_repair: 3,
  seo_score: 3,
  persist: 3,
  completed: 4,
};

function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s}초`;
  return `${m}분 ${s.toString().padStart(2, "0")}초`;
}

export function MobileGenerating({
  postId,
  keyword,
  voiceName,
  imageCount,
}: {
  postId: string;
  keyword: string;
  voiceName: string;
  imageCount: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<string>("pending");
  const [pct, setPct] = useState(4);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const steps = [
    { label: "사진에서 작업 순서 읽기", rank: 1 },
    { label: `사진 설명 ${Math.max(imageCount, 1)}개 붙이기`, rank: 1.5 },
    { label: `'${voiceName}' 말투로 문단 쓰기`, rank: 2 },
    { label: "제목 3개 뽑기", rank: 3 },
  ];

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Ease the bar toward the phase ceiling while we wait.
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => {
        const { ceiling } = phaseProgressRange(phase, "generate");
        return p < ceiling ? Math.min(ceiling, p + 0.4) : p;
      });
    }, 400);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    function onPhase(job: ClientJob) {
      setPhase(job.phase);
      const { floor } = phaseProgressRange(job.phase, "generate");
      setPct((p) => Math.max(p, floor));
    }

    (async () => {
      try {
        let job = await resumeActiveGenerationJob(postId, { onPhase });
        if (!job) {
          job = await runGenerationJobClient({
            postId,
            body: { kind: "generate", keyword },
            onPhase,
          });
        }
        if (job && job.status === "completed") {
          setPct(100);
          setPhase("completed");
          router.replace(`/m/${postId}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "초안 생성에 실패했습니다.");
      }
    })();
  }, [postId, keyword, router]);

  const rank = PHASE_RANK[phase] ?? 0;

  return (
    <main className="fixed inset-0 z-40 mx-auto flex w-full max-w-[480px] flex-col bg-[#16161A] text-white">
      <div className="flex flex-1 flex-col justify-center gap-[34px] px-[30px]">
        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-bold uppercase tracking-[.09em] text-[#8B8B98]">
            {error ? "초안 만들기 실패" : "초안 만드는 중"}
          </span>
          <h2 className="whitespace-pre-line text-[27px] font-bold leading-[1.35]">
            {error
              ? "잠시 문제가 있었습니다"
              : `사진 ${Math.max(imageCount, 1)}장을 읽고\n말투를 맞추고 있습니다`}
          </h2>
        </div>

        {error ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13.5px] leading-[1.6] text-[#c9c9d2]">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                startedRef.current = false;
                setPhase("pending");
                setPct(4);
                router.refresh();
              }}
              className="flex h-12 items-center justify-center rounded-[12px] bg-[#4C8DFF] text-[15px] font-semibold text-[#16161A]"
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={() => router.replace("/m")}
              className="flex h-11 items-center justify-center rounded-[12px] border border-[#332c52] text-[14px] font-semibold text-[#8b8b98]"
            >
              홈으로
            </button>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-4">
              {steps.map((step) => {
                const done = rank > step.rank;
                const active = !done && rank >= Math.floor(step.rank);
                return (
                  <li
                    key={step.label}
                    className={`flex items-center gap-3 ${done || active ? "opacity-100" : "opacity-45"}`}
                  >
                    <span
                      className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full ${
                        done
                          ? "bg-[#0F7B52]"
                          : active
                            ? "bg-[#4C8DFF]"
                            : "border-[1.5px] border-[#63636f] bg-transparent"
                      }`}
                    >
                      {done ? (
                        <Check className="h-[15px] w-[15px] text-white" strokeWidth={2.4} />
                      ) : active ? (
                        <Sparkles className="h-[15px] w-[15px] text-[#16161A]" strokeWidth={2} />
                      ) : null}
                    </span>
                    <span
                      className={`text-[15px] ${
                        active
                          ? "font-semibold text-white"
                          : done
                            ? "font-medium text-[#f2f2f5]"
                            : "text-[#8b8b98]"
                      }`}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#26262f]">
                <div
                  className="h-full rounded-full bg-[#4C8DFF] transition-[width] duration-500"
                  style={{ width: `${Math.min(100, Math.round(pct))}%` }}
                />
              </div>
              <span className="text-[12.5px] text-[#8b8b98] [font-variant-numeric:tabular-nums]">
                {fmtElapsed(elapsed)} 지남 · 평균 1분 48초
              </span>
            </div>

            <div className="rounded-[14px] border border-[#26262f] bg-[#1a1a21] px-4 py-[15px]">
              <span className="text-[11.5px] font-bold text-[#4C8DFF]">지금 하는 일</span>
              <p className="pt-1.5 text-[14px] leading-[1.7] text-[#c9c9d2]">
                {phaseStatusLabel(phase, "generate")}
              </p>
            </div>
          </>
        )}
      </div>

      {!error ? (
        <div className="px-[30px] pb-[26px]">
          <button
            type="button"
            onClick={() => router.replace("/m")}
            className="flex h-[52px] w-full items-center justify-center rounded-[13px] border border-[#332c52] text-[14.5px] font-semibold text-[#8b8b98]"
          >
            닫아도 계속 만듭니다
          </button>
        </div>
      ) : null}
    </main>
  );
}
