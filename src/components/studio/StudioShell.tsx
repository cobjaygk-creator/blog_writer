"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  FolderOpen,
  Home,
  LogOut,
  Palette,
  Plus,
  Settings,
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
    id: "create",
    href: "/posts/new",
    label: "만들기",
    icon: Plus,
    match: (p) => p.startsWith("/posts/new"),
  },
  {
    id: "themes",
    href: "/brands",
    label: "테마",
    icon: Palette,
    match: (p) => p.startsWith("/brands"),
  },
  {
    id: "projects",
    href: "/posts",
    label: "프로젝트",
    icon: FolderOpen,
    match: (p) => p === "/posts" || (p.startsWith("/posts/") && !p.startsWith("/posts/new")),
  },
];

function screenTitle(pathname: string): string {
  if (pathname === "/dashboard" || pathname === "/") return "홈";
  if (pathname.startsWith("/posts/new")) return "새 글";
  if (pathname.startsWith("/posts")) return "프로젝트";
  if (pathname.startsWith("/brands")) return "테마";
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
    <div ref={rootRef} className="relative flex flex-col items-center gap-[5px] pb-1.5 pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={email || "계정"}
        aria-expanded={open}
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#16161A] text-[10px] font-bold text-white"
      >
        {initialsFromEmail(email)}
      </button>
      {planLabel ? (
        <span className="text-[8.5px] font-bold tracking-[.08em] text-[var(--accent)]">
          {planLabel.toUpperCase()}
        </span>
      ) : null}

      {open ? (
        <div className="absolute bottom-full left-1/2 z-20 mb-2 w-[168px] -translate-x-1/2 rounded-[10px] border border-[var(--border-strong)] bg-white p-1 shadow-[0_8px_24px_rgba(22,22,26,.14)]">
          {email ? (
            <p className="truncate px-2.5 py-1.5 text-[10.5px] text-[var(--faint)]">{email}</p>
          ) : null}
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

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--background)] text-[color:var(--foreground)]">
      <aside className="flex w-[64px] shrink-0 flex-col border-r border-[var(--border)] bg-white">
        <Link
          href="/dashboard"
          className="flex h-[52px] items-center justify-center border-b border-[var(--border)]"
          title="Ditodio"
        >
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-[var(--accent)] text-[12px] font-bold text-white">
            Di
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 p-1.5">
          {RAIL.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-[9px] px-1 py-[9px] text-[9.5px] font-semibold transition-colors",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[#8A8A94] hover:bg-[var(--background)] hover:text-[color:var(--foreground)]",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
                {item.label}
              </Link>
            );
          })}
          <NewCutLink>
            <span className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-[9px] px-1 py-[9px] text-[9.5px] font-semibold text-[#8A8A94] transition-colors hover:bg-[var(--background)] hover:text-[color:var(--foreground)]">
              <Clapperboard className="h-[18px] w-[18px]" strokeWidth={1.7} />
              쇼츠
            </span>
          </NewCutLink>
        </nav>
        <div className="border-t border-[var(--border)] px-1.5">
          <Link
            href="/billing"
            className={cn(
              "flex flex-col items-center gap-1 rounded-[9px] px-1 py-[9px] text-[9.5px] font-semibold",
              pathname.startsWith("/billing")
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[#8A8A94] hover:bg-[var(--background)]",
            )}
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.7} />
            요금
          </Link>
          <AccountMenu email={email} planLabel={planLabel} isAdmin={isAdmin} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!isPostEditor ? (
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
