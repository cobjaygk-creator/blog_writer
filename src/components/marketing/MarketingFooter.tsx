import Link from "next/link";

import { NewCutLink } from "@/components/NewCutLink";

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-inner">
        <p>© {new Date().getFullYear()} Ditodio</p>
        <div className="marketing-footer-links">
          <Link href="/billing">요금</Link>
          <Link href="/login">로그인</Link>
          <NewCutLink className="hover:opacity-80">New Cut</NewCutLink>
        </div>
      </div>
    </footer>
  );
}