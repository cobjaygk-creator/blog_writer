import * as React from "react";

import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label className={cn("block space-y-1.5 text-sm font-medium text-zinc-800", className)} {...props} />
  );
}
