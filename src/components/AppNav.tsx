"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { buildNewCutDeepLink } from "@/lib/newcut";
import { cn } from "@/lib/utils";

const NAV_LINKS: Array<{
  href: string;
  label: string;
  match?: (pathname: string) => boolean;
}> = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/brands", label: "테마 등록", match: (p) => p.startsWith("/brands") },
  {
    href: "/posts",
    label: "글 목록",
    match: (p) => p === "/posts" || (p.startsWith("/posts/") && !p.startsWith("/posts/new")),
  },
  { href: "/posts/new", label: "새 글", match: (p) => p.startsWith("/posts/new") },
];

export function AppNav({
  email,
  planLabel,
  isAdmin,
  className,
}: {
  email?: string | null;
  planLabel?: string | null;
  isAdmin?: boolean;
  className?: string;
}) {
  const pathname = usePathname() || "/";
  const newCutUrl = buildNewCutDeepLink({ from: "blog_writer" });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <header className={cn("border-b border-zinc-200 bg-white/80 backdrop-blur", className)}>
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex min-w-0 items-center gap-5">
          <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight text-zinc-900">
            blog_writer
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
            {NAV_LINKS.map((link) => {
              const active =
                "match" in link && link.match
                  ? link.match(pathname)
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 rounded-sm",
                    active && "font-medium text-zinc-900",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/billing"
              aria-current={pathname.startsWith("/billing") ? "page" : undefined}
              className={cn(
                "hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 rounded-sm",
                pathname.startsWith("/billing") && "font-medium text-zinc-900",
              )}
            >
              요금
            </Link>
            {isAdmin ? (
              <Link
                href="/admin"
                className="hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 rounded-sm"
              >
                관리
              </Link>
            ) : null}
            <a
              href={newCutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 rounded-sm"
              title="New Cut 스튜디오에서 쇼츠 만들기"
            >
              New Cut 쇼츠
            </a>
          </nav>
        </div>

        {email ? (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              className="max-w-[10rem] truncate rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 sm:max-w-[14rem]"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {email}
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
              >
                <div className="border-b border-zinc-100 px-3 py-2">
                  <p className="truncate text-xs font-medium text-zinc-900">{email}</p>
                  {planLabel ? (
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-500">
                      {planLabel}
                    </p>
                  ) : null}
                </div>
                <Link
                  href="/dashboard"
                  role="menuitem"
                  className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  onClick={() => setMenuOpen(false)}
                >
                  대시보드
                </Link>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    role="menuitem"
                    className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    관리자 메뉴
                  </Link>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut({ callbackUrl: "/" });
                  }}
                >
                  로그아웃
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <Link href="/login">
            <Button type="button" size="sm" variant="outline">
              로그인
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
