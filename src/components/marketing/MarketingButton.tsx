import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "dark";

const variantClass: Record<Variant, string> = {
  primary: "marketing-btn-primary",
  secondary: "marketing-btn-secondary",
  ghost: "marketing-btn-ghost",
  dark: "marketing-btn-dark",
};

export function MarketingButton({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn("marketing-btn", variantClass[variant], className)}>
      {children}
    </Link>
  );
}
