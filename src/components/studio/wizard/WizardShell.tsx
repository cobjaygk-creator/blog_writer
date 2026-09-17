"use client";

import { ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function WizardShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-2)]">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#C2C2CC] hover:bg-[var(--surface-2)] hover:text-[var(--muted)]"
        >
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>
        <span className="text-[14.5px] font-bold text-[var(--foreground)]">{title}</span>
        <div className="flex-1" />
        <Link
          href="/dashboard"
          aria-label="그만두기"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#C2C2CC] hover:bg-[var(--surface-2)] hover:text-[var(--muted)]"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2} />
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-3 overflow-y-auto px-6 py-8">
        {children}
      </div>
    </div>
  );
}
