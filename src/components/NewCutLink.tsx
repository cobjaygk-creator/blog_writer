"use client";

import { useState, type ReactNode } from "react";

import { buildNewCutDeepLink } from "@/lib/newcut";
import { cn } from "@/lib/utils";

type Props = {
  brandId?: string;
  postId?: string;
  className?: string;
  title?: string;
  children: ReactNode;
};

/** Opens New Cut with a short-lived Ditodio handoff so the same account is used. */
export function NewCutLink({ brandId, postId, className, title, children }: Props) {
  const [busy, setBusy] = useState(false);
  const fallback = buildNewCutDeepLink({ from: "ditodio", brandId, postId });

  async function openWithHandoff(e: React.MouseEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ link: "1" });
      if (brandId) qs.set("brandId", brandId);
      if (postId) qs.set("postId", postId);
      const res = await fetch(`/api/platform/handoff?${qs.toString()}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      const href =
        res.ok && typeof data.deepLink === "string" && data.deepLink
          ? data.deepLink
          : fallback;
      window.open(href, "_blank", "noopener,noreferrer");
    } catch {
      window.open(fallback, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <a
      href={fallback}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(className, busy && "opacity-60")}
      title={title}
      onClick={(e) => void openWithHandoff(e)}
    >
      {children}
    </a>
  );
}
