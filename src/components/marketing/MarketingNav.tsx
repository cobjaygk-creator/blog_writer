import Link from "next/link";

import { MarketingButton } from "@/components/marketing/MarketingButton";

export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="marketing-nav">
      <div className="marketing-nav-inner">
        <Link href="/" className="marketing-brand">
          Ditodio
        </Link>
        <div className="marketing-nav-actions">
          {signedIn ? (
            <MarketingButton href="/dashboard">대시보드로 이동</MarketingButton>
          ) : (
            <>
              <MarketingButton href="/login" variant="ghost">
                로그인
              </MarketingButton>
              <MarketingButton href="/register">시작하기</MarketingButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
