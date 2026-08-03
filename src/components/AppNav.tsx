import Link from "next/link";

import { buildNewCutDeepLink } from "@/lib/newcut";
import { cn } from "@/lib/utils";

export function AppNav({
  email,
  className,
}: {
  email?: string | null;
  className?: string;
}) {
  const newCutUrl = buildNewCutDeepLink({ from: "blog_writer" });

  return (
    <header className={cn("border-b border-zinc-200 bg-white/80 backdrop-blur", className)}>
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-5">
          <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900">
            blog_writer
          </Link>
          <nav className="flex items-center gap-3 text-sm text-zinc-600">
            <Link href="/dashboard" className="hover:text-zinc-900">
              대시보드
            </Link>
            <Link href="/brands/new" className="hover:text-zinc-900">
              업체 추가
            </Link>
            <a
              href={newCutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-900"
              title="New Cut 스튜디오에서 쇼츠 만들기"
            >
              New Cut 쇼츠
            </a>
          </nav>
        </div>
        {email ? <p className="truncate text-xs text-zinc-500">{email}</p> : null}
      </div>
    </header>
  );
}
