"use client";

import { useSmoothProgress } from "@/hooks/useSmoothProgress";

type Props = {
  open: boolean;
  title?: string;
  statusLine: string;
  /** Phase floor / current hard target (0–100). */
  target: number;
  /** Soft ceiling while waiting in phase (0–100). */
  ceiling: number;
  complete?: boolean;
  detail?: string | null;
};

export function GenerationProgressModal({
  open,
  title = "초안 생성 중",
  statusLine,
  target,
  ceiling,
  complete,
  detail,
}: Props) {
  const progress = useSmoothProgress({
    active: open,
    target,
    ceiling,
    complete,
  });

  if (!open) return null;

  const shown = Math.min(100, Math.max(0, progress));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-progress-title"
      aria-busy="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-6 shadow-xl">
        <p
          id="generation-progress-title"
          className="text-lg font-bold tracking-tight text-[color:var(--foreground)]"
        >
          {title}
        </p>
        <p className="mt-2 text-sm text-[color:var(--muted)]">{statusLine}</p>
        {detail ? <p className="mt-1 text-xs text-[color:var(--muted)]">{detail}</p> : null}

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-[var(--accent)]">진행률</span>
            <span className="tabular-nums text-sm font-semibold text-[color:var(--foreground)]">
              {Math.floor(shown)}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[var(--background)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150 ease-out"
              style={{ width: `${shown}%` }}
            />
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-[color:var(--muted)]">
          창을 닫지 마세요. 완료되면 자동으로 이어집니다.
        </p>
      </div>
    </div>
  );
}
