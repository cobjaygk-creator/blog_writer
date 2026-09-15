"use client";

import { Clapperboard, FolderOpen, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NewCutLink } from "@/components/NewCutLink";
import { cn } from "@/lib/utils";

/** Only the top-level mobile screens carry the tab bar; the create/generate/publish
 *  flow screens have their own bottom action bars. */
const TAB_PATHS = new Set(["/m", "/m/posts"]);

export function MobileTabBar() {
  const pathname = usePathname() || "/m";
  if (!TAB_PATHS.has(pathname)) return null;

  const cls = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center gap-1 pt-2 text-[10.5px] font-semibold transition-colors",
      active ? "text-[var(--accent)]" : "text-[#8A8A94]",
    );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[76px] w-full max-w-[480px] border-t border-[var(--border)] bg-white pb-[14px]">
      <Link href="/m" className={cls(pathname === "/m")} aria-current={pathname === "/m" ? "page" : undefined}>
        <Home className="h-[22px] w-[22px]" strokeWidth={1.8} />홈
      </Link>
      <Link
        href="/m/posts"
        className={cls(pathname === "/m/posts")}
        aria-current={pathname === "/m/posts" ? "page" : undefined}
      >
        <FolderOpen className="h-[22px] w-[22px]" strokeWidth={1.8} />내 글
      </Link>
      <NewCutLink className={cls(false)}>
        <Clapperboard className="h-[22px] w-[22px]" strokeWidth={1.8} />쇼츠
      </NewCutLink>
    </nav>
  );
}
