"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  CreditCard,
  FolderOpen,
  Home,
  LogOut,
  Palette,
  Shield,
} from "lucide-react";

import { NewCutLink } from "@/components/NewCutLink";
import { cn } from "@/lib/utils";

type RailItem = {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match: (pathname: string) => boolean;
  external?: boolean;
};

const RAIL: RailItem[] = [
  {
    id: "home",
    href: "/dashboard",
    label: "홈",
    icon: Home,
    match: (p) => p === "/dashboard" || p === "/",
  },
  {
    id: "projects",
    href: "/posts",
    label: "내 글",
    icon: FolderOpen,
    match: (p) => p === "/posts" || p.startsWith("/posts/"),
  },
  {
    id: "voices",
    href: "/brands",
    label: "말투",
    icon: Palette,
    match: (p) => p.startsWith("/brands"),
  },
];

function screenTitle(pathname: string): string {
  if (pathname === "/dashboard" || pathname === "/") return "홈";
  if (pathname.startsWith("/posts/new")) return "새 글";
  if (pathname.startsWith("/posts")) return "내 글";
  if (pathname.startsWith("/brands")) return "말투";
  if (pathname.startsWith("/billing")) return "요금 · 사용량";
  if (pathname.startsWith("/admin")) return "관리자";
  return "Ditodio Studio";
}

function initialsFromEmail(email?: string | null) {
  if (!email) return "U";
  const local = email.split("@")[0] || email;
  return local.slice(0, 2).toUpperCase();
}

function AccountMenu({
  email,
  planLabel,
  isAdmin,
}: {
  email?: string | null;
  planLabel?: string | null;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex flex-col items-center pb-[18px] pt-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={email || "계정"}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#16161A] text-[11.5px] font-bold text-white"
      >
        {initialsFromEmail(email)}
      </button>

      {open ? (
        <div className="absolute bottom-full left-2 z-20 mb-2 w-[176px] rounded-[10px] border border-[var(--border-strong)] bg-white p-1 shadow-[0_8px_24px_rgba(22,22,26,.14)]">
          {email ? (
            <p className="truncate px-2.5 py-1.5 text-[10.5px] text-[var(--faint)]">
              {email}
              {planLabel ? (
                <span className="ml-1 font-bold uppercase text-[var(--accent)]">· {planLabel}</span>
              ) : null}
            </p>
          ) : null}
          <Link
            href="/billing"
            className="flex items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
            onClick={() => setOpen(false)}
          >
            <CreditCard className="h-[15px] w-[15px]" strokeWidth={1.8} />
            요금 · 사용량
          </Link>
          {isAdmin ? (
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
              onClick={() => setOpen(false)}
            >
              <Shield className="h-[15px] w-[15px]" strokeWidth={1.8} />
              관리
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
          >
            <LogOut className="h-[15px] w-[15px]" strokeWidth={1.8} />
            나가기
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function StudioShell({
  email,
  planLabel,
  isAdmin,
  children,
}: {
  email?: string | null;
  planLabel?: string | null;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const isPostEditor = /^\/posts\/[^/]+$/.test(pathname) && !pathname.startsWith("/posts/new");
  const isHome = pathname === "/dashboard";

  const navItemClass = (active: boolean) =>
    cn(
      "flex flex-col items-center gap-1.5 rounded-[12px] px-1 py-3 text-[10.5px] font-semibold transition-colors",
      active
        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
        : "text-[#8A8A94] hover:bg-[var(--background)] hover:text-[color:var(--foreground)]",
    );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--background)] text-[color:var(--foreground)]">
      <aside className="flex w-[80px] shrink-0 flex-col border-r border-[var(--border)] bg-white">
        <Link href="/dashboard" className="flex h-16 items-center justify-center" title="Ditodio">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--accent)] text-[13px] font-bold text-white">
            Di
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1.5 p-2">
          {RAIL.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={navItemClass(active)}
              >
                <Icon className="h-5 w-5" strokeWidth={1.7} />
                {item.label}
              </Link>
            );
          })}
          <NewCutLink>
            <span className={cn("w-full cursor-pointer", navItemClass(false))}>
              <Clapperboard className="h-5 w-5" strokeWidth={1.7} />
              쇼츠
            </span>
          </NewCutLink>
        </nav>
        <AccountMenu email={email} planLabel={planLabel} isAdmin={isAdmin} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!isPostEditor && !isHome ? (
          <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-white px-5">
            <span className="text-[13.5px] font-bold tracking-[-.015em] text-[var(--foreground)]">
              {screenTitle(pathname)}
            </span>
          </header>
        ) : null}
        <div
          className={cn(
            "min-h-0 flex-1",
            isPostEditor ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
