import Link from "next/link";

import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-20">
      <p className="text-sm font-medium tracking-wide text-zinc-500">blog_writer</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
        AI 블로그 포스트 생성기
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">
        업체별 기존 글을 학습해 문체 프로필을 만들고, 사진과 키워드로 블로그 초안을 생성합니다.
        New Cut(쇼츠)과 분리된 서비스이며, 이후 메뉴로 연결할 예정입니다.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {session?.user ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            대시보드로 이동
          </Link>
        ) : (
          <>
            <Link
              href="/register"
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              시작하기
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              로그인
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
