import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-[8px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-[0_1px_2px_rgba(75,59,255,.4)]",
        outline: "border border-[var(--border-strong)] bg-white text-[#3A3A44] hover:border-[#C6C6CE]",
        ghost: "text-[color:var(--muted)] hover:bg-[var(--background)] hover:text-[color:var(--foreground)]",
        dark: "bg-[#16161A] text-white hover:bg-[#2A2A34]",
        danger: "bg-[#C2453C] text-white hover:bg-[#A8382F]",
      },
      size: {
        default: "h-[30px] px-3.5 text-[12px]",
        sm: "h-[28px] px-2.5 text-[11.5px]",
        lg: "h-[42px] px-4 text-[13.5px] rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
