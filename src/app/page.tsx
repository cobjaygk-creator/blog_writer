import Link from "next/link";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { buildNewCutDeepLink } from "@/lib/newcut";

export default async function HomePage() {
  const session = await auth();
  const newCutUrl = buildNewCutDeepLink({ from: "blog_writer" });

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,_rgba(24,24,27,0.08),_transparent_65%)]"
      />
      <p className="text-sm font-medium tracking-wide text-zinc-500">blog_writer</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
        AI 블로그 포스트 생성기
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">
        테마 문체를 학습한 뒤 사진·키워드로 블로그 글을 만들고, 네이버·티스토리에 복사해 올릴 수 있게 돕습니다.
        New Cut 쇼츠와도 메뉴로 연결됩니다.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {session?.user ? (
          <Link href="/dashboard">
            <Button>대시보드로 이동</Button>
          </Link>
        ) : (
          <>
            <Link href="/register">
              <Button>시작하기</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline">로그인</Button>
            </Link>
          </>
        )}
        <a href={newCutUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost">New Cut 쇼츠 만들기</Button>
        </a>
      </div>
      <ol className="mt-12 max-w-xl space-y-2 text-sm leading-6 text-zinc-600">
        <li>1. 테마 등록에서 샘플 원문으로 문체 학습</li>
        <li>2. 새 글에서 학습된 테마로 사진·키워드 초안 생성</li>
        <li>3. 제목·본문 복사 → 네이버/티스토리에 붙여넣기</li>
      </ol>
    </main>
  );
}
