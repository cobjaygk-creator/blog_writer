"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "개요", exact: true },
  { href: "/admin/stats", label: "통계" },
  { href: "/admin/usage", label: "사용량" },
  { href: "/admin/users", label: "회원" },
  { href: "/admin/plans", label: "요금제" },
  { href: "/admin/promotions", label: "프로모션" },
  { href: "/admin/subscriptions", label: "구독" },
  { href: "/admin/payments", label: "결제" },
  { href: "/admin/integrations", label: "연동·API 키" },
  { href: "/admin/settings", label: "설정" },
  { href: "/admin/audit", label: "감사 로그" },
];

export function AdminShell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/admin";

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-base font-bold text-[color:var(--foreground)]">
              Ditodio 관리
            </Link>
            <span className="hidden text-[11px] text-[color:var(--muted)] sm:inline">
              통합 · 포스트 · 쇼츠
            </span>
            <Link
              href="/dashboard"
              className="text-xs text-[color:var(--muted)] hover:text-[var(--accent)]"
            >
              ← 앱으로
            </Link>
          </div>
          {email ? (
            <p className="truncate text-xs text-[color:var(--muted)]">{email}</p>
          ) : null}
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-8">
        <aside className="hidden w-48 shrink-0 md:block">
          <nav className="sticky top-4 space-y-0.5 text-sm">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-[8px] px-3 py-2",
                    active
                      ? "bg-[var(--accent)] font-semibold text-white"
                      : "text-[color:var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
