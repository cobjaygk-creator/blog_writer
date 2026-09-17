"use client";

import { ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function WizardShell({
  title,
  stepIndex,
  stepCount,
  onBack,
  children,
  footer,
}: {
  title: string;
  stepIndex: number;
  stepCount: number;
  onBack: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#C2C2CC] hover:bg-[var(--surface-2)] hover:text-[var(--muted)]"
        >
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>
        <span className="text-[14.5px] font-bold text-[var(--foreground)]">{title}</span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: stepCount }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-[6px] w-[18px] rounded-full transition-colors",
                i <= stepIndex ? "bg-[var(--accent)]" : "bg-[#EDEDF1]",
              )}
            />
          ))}
        </div>
        <span className="[font-variant-numeric:tabular-nums] text-[11px] font-semibold text-[var(--hint)]">
          {stepIndex + 1} / {stepCount}
        </span>
        <div className="flex-1" />
        <Link
          href="/dashboard"
          aria-label="그만두기"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#C2C2CC] hover:bg-[var(--surface-2)] hover:text-[var(--muted)]"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2} />
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6 overflow-y-auto px-6 py-10">
        {children}
      </div>

      <div className="flex h-[78px] shrink-0 items-center gap-3 border-t border-[#F0F0F3] px-6">
        {footer}
      </div>
    </div>
  );
}
