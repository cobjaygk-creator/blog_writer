import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONE = {
  neutral: "bg-[#F0F0F3] text-[#6B6B75]",
  accent: "bg-[#EFEDFF] text-[#4B3BFF]",
  success: "bg-[#E7F5EF] text-[#0F7B52]",
  warning: "bg-[#F4EDD8] text-[#8A6410]",
  danger: "bg-[#F7E7E5] text-[#C2453C]",
} as const;

export type BadgeTone = keyof typeof TONE;

export function Badge({
  className,
  variant = "accent",
  children,
}: {
  className?: string;
  variant?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-[5px] border-0 px-2 text-[10.5px] font-bold",
        TONE[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
