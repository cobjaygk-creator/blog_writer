import Link from "next/link";

import { NewCutLink } from "@/components/NewCutLink";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

/** Previous `/` landing — restore via page.tsx re-export for instant rollback. */
export default async function LegacyHomePage() {
  const session = await auth();

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,_rgba(24,24,27,0.08),_transparent_65%)]"
      />
      <p className="text-sm font-medium tracking-wide text-zinc-500">Ditodio</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
        현장·제품 검증 초안 + 쇼츠 원소스
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">
        SEO 공장·매크로 자동발행기가 아닙니다. 테마 문체를 학습해 시공·제품·주제 초안을 만들고,
        복사해 네이버/티스토리에 올린 뒤 New Cut 쇼츠로 이어가세요. 포스트와 쇼츠 한도는 한 계정으로
        함께 적용됩니다.
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
        <NewCutLink>
          <Button variant="ghost">New Cut 쇼츠 만들기</Button>
        </NewCutLink>
      </div>
      <ol className="mt-12 max-w-xl space-y-2 text-sm leading-6 text-zinc-600">
        <li>1. 테마에 샘플 원문을 넣고 문체 학습</li>
        <li>2. 시공·제품·주제 모드로 초안 생성 (검수·수정)</li>
        <li>3. 제목·본문 복사 → 네이버/티스토리에 붙여넣기 → URL 기록</li>
        <li>4. (선택) New Cut으로 쇼츠 제작</li>
      </ol>
    </main>
  );
}
