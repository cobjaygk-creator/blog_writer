"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";

export function AccordionField({
  label,
  summary,
  state,
  onEdit,
  children,
}: {
  label: string;
  summary?: string;
  state: "done" | "active" | "pending";
  onEdit: () => void;
  children: ReactNode;
}) {
  if (state === "pending") return null;

  if (state === "done") {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-3 rounded-[12px] border border-[var(--border)] bg-white px-4 py-3.5 text-left transition-colors hover:border-[var(--border-strong)]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E7F5EF] text-[#0F7B52]">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        <span className="w-16 shrink-0 text-[12.5px] font-semibold text-[var(--faint)]">
          {label}
        </span>
        <span className="flex-1 truncate text-[14px] text-[var(--foreground)]">{summary}</span>
        <span className="shrink-0 text-[12px] font-semibold text-[var(--accent)]">수정</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-[16px] border-[1.5px] border-[var(--accent)] bg-white p-5 shadow-[0_2px_10px_rgba(22,22,26,.05)]">
      {children}
    </div>
  );
}
