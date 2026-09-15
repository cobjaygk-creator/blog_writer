import Link from "next/link";

import { MarketingButton } from "@/components/marketing/MarketingButton";
import { NewCutLink } from "@/components/NewCutLink";
import { cn } from "@/lib/utils";

export function MarketingNav({
  signedIn,
  active,
}: {
  signedIn: boolean;
  active?: "home" | "pricing" | "shorts";
}) {
  return (
    <header className="marketing-nav">
      <div className="marketing-nav-inner">
        <Link href="/" className="marketing-brand">
          Ditodio
        </Link>
        <div className="marketing-nav-links">
          <Link
            href="/#steps"
            className={cn("marketing-nav-link", active === "home" && "is-active")}
          >
            기능
          </Link>
          <Link
            href="/pricing"
            className={cn("marketing-nav-link", active === "pricing" && "is-active")}
          >
            요금
          </Link>
          <NewCutLink className="marketing-nav-link">쇼츠</NewCutLink>
        </div>
        <div className="marketing-nav-actions">
          {signedIn ? (
            <MarketingButton href="/dashboard">대시보드로 이동</MarketingButton>
          ) : (
            <>
              <MarketingButton href="/login" variant="ghost">
                로그인
              </MarketingButton>
              <MarketingButton href="/register">무료로 시작</MarketingButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
