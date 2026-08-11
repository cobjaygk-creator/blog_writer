"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Clapperboard,
  FileText,
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
  icon: React.ComponentType<{ className?: string }>;
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
    <div className="flex h-[100dvh] overflow-hidden bg-[#F3F4F8] text-[color:var(--foreground)]">
      <aside className="flex w-[72px] shrink-0 flex-col border-r border-[var(--border)] bg-white">
        <Link
          href="/dashboard"
          className="flex h-14 items-center justify-center border-b border-[var(--border)] text-sm font-bold tracking-tight"
          title="Ditodio"
        >
          Di
        </Link>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {RAIL.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[color:var(--muted)] hover:bg-[var(--background)] hover:text-[color:var(--foreground)]",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <NewCutLink>
            <span
              className={cn(
                "flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium text-[color:var(--muted)] transition-colors hover:bg-[var(--background)] hover:text-[color:var(--foreground)]",
              )}
            >
              <Clapperboard className="h-5 w-5" />
              쇼츠
            </span>
          </NewCutLink>
        </nav>
        <div className="space-y-1 border-t border-[var(--border)] p-2">
          <Link
            href="/billing"
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium",
              pathname.startsWith("/billing")
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[color:var(--muted)] hover:bg-[var(--background)]",
            )}
          >
            <Settings className="h-5 w-5" />
            요금
          </Link>
          {isAdmin ? (
            <Link
              href="/admin"
              className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium text-[color:var(--muted)] hover:bg-[var(--background)]"
            >
              <Shield className="h-5 w-5" />
              관리
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/" })}
            className="flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium text-[color:var(--muted)] hover:bg-[var(--background)]"
            title={email || "로그아웃"}
          >
            <LogOut className="h-5 w-5" />
            나가기
          </button>
          {planLabel ? (
            <p className="truncate px-1 pb-1 text-center text-[9px] uppercase tracking-wide text-[color:var(--muted)]">
              {planLabel}
            </p>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!isPostEditor ? (
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-white/90 px-4 backdrop-blur">
            <FileText className="h-4 w-4 text-[var(--accent)]" />
            <p className="text-sm font-semibold">Ditodio Studio</p>
            <p className="truncate text-xs text-[color:var(--muted)]">{email}</p>
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
