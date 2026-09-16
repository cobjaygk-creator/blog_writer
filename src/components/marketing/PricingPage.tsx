import { Check } from "lucide-react";
import { Inter, Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import type { CSSProperties } from "react";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { auth } from "@/lib/auth";

import "./marketing.css";

const marketingFont = Inter({
  subsets: ["latin"],
  variable: "--font-marketing-inter",
  display: "swap",
});

const marketingKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-marketing-kr",
  display: "swap",
});

// TODO: wire real checkout once the four-tier plan codes replace free/lite/pro
// in src/lib/plans.ts (see design_handoff_ditodio_productization/README.md §"구현
// 전 확정해야 할 것"). Until then every "시작" CTA below routes to onboarding.
const CONTACT_EMAIL = "hello@ditodio.co";

type Plan = {
  id: string;
  name: string;
  target: string;
  price: string;
  quota: string;
  unit: string;
  cta: string;
  href: string;
  highlight?: boolean;
  badge?: string;
  badgeColor?: string;
  features: { title: string; note?: string }[];
};

const PLANS: Plan[] = [
  {
    id: "lite",
    name: "라이트",
    target: "먼저 결과를 보고 정하기",
    price: "₩0",
    quota: "월 1회 무료 체험",
    unit: "자동 과금 없음",
    cta: "무료 체험 시작",
    href: "/register",
    features: [
      { title: "월 1회 실제 생성", note: "맛보기가 아니라 그대로 올려도 되는 글 1편" },
      { title: "이미지 생성 포함" },
      { title: "SEO-GEO 최적화" },
      { title: "대기업 블로그 스타일" },
      { title: "1회 이후 자동 과금 없음" },
    ],
  },
  {
    id: "standard",
    name: "스탠다드",
    target: "1인 사장님 · 한 가게 한 브랜드",
    price: "₩9,900",
    quota: "월 15회 생성",
    unit: "1회당 약 660원",
    cta: "스탠다드 시작",
    href: "/register",
    highlight: true,
    badge: "가장 많이 선택",
    features: [
      { title: "월 15회 정규 생성", note: "주 3~4편 — 발행 주기를 지키는 최소선" },
      { title: "이미지 생성 포함" },
      { title: "SEO-GEO 최적화" },
      { title: "대기업 블로그 스타일" },
      { title: "생성 한도 내 자유 수정", note: "문단 다시 쓰기는 횟수에 포함되지 않습니다" },
    ],
  },
  {
    id: "premium",
    name: "프리미엄",
    target: "성장 중인 매장 · 여러 채널 운영",
    price: "₩19,800",
    quota: "월 30회 생성",
    unit: "1회당 약 660원",
    cta: "프리미엄 시작",
    href: "/register",
    badge: "성장 운영 추천",
    badgeColor: "#0064FF",
    features: [
      { title: "월 30회 정규 생성", note: "매일 한 편 — 검색 노출이 쌓이는 구간" },
      { title: "이미지 생성 포함" },
      { title: "SEO-GEO 최적화" },
      { title: "대기업 블로그 스타일" },
      { title: "생성 한도 내 자유 수정" },
    ],
  },
  {
    id: "enterprise",
    name: "엔터프라이즈",
    target: "마케팅 대행사 · 팀 운영",
    price: "₩39,500",
    quota: "월 60회 생성",
    unit: "1회당 약 658원",
    cta: "상담 요청",
    href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Ditodio 엔터프라이즈 상담 요청")}`,
    features: [
      { title: "월 60회 정규 생성", note: "고객사 여러 곳을 동시에" },
      { title: "전용 지원 채널" },
      { title: "주간 운영 리포트" },
      { title: "이미지 생성 포함" },
      { title: "우선순위 에이전트 배정", note: "대기 없이 먼저 생성됩니다" },
    ],
  },
];

const FAQ = [
  {
    q: "생성 '1회'는 어떻게 집계되나요?",
    a: "글 한 편을 만드는 것이 1회입니다. 만들어진 글 안에서 문단을 고치거나 다시 쓰는 것은 횟수에 들어가지 않습니다.",
  },
  {
    q: "남은 횟수는 다음 달로 넘어가나요?",
    a: "이월되지 않고 매달 초기화됩니다. 남는 달이 계속 이어지면 아래 단계로 내리셔도 됩니다.",
  },
  {
    q: "중간에 플랜을 바꿀 수 있나요?",
    a: "올리는 건 즉시, 내리는 건 다음 결제일에 적용됩니다. 남은 횟수는 그 달까지 그대로 쓰실 수 있습니다.",
  },
  {
    q: "환불되나요?",
    a: "결제 후 7일 안에 생성을 하지 않으셨다면 전액 환불합니다. 그 뒤에는 남은 횟수만큼 안내드립니다.",
  },
];

export default async function PricingPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <div
      className={`marketing ${marketingFont.variable} ${marketingKr.variable}`}
      style={
        {
          ["--font-marketing" as string]:
            "var(--font-marketing-inter), var(--font-marketing-kr), sans-serif",
        } as CSSProperties
      }
    >
      <MarketingNav signedIn={signedIn} active="pricing" />

      <div className="marketing-pricing-hero">
        <h1>생성 1회에 660원</h1>
        <p>글 한 편을 만드는 것이 &lsquo;1회&rsquo;입니다. 이미지 생성은 모든 요금제에 포함됩니다.</p>
        <div className="marketing-pricing-pill">
          <Check size={15} strokeWidth={2.6} />
          1회 무료 체험 후 자동 과금 없음 — 직접 결제하실 때만 시작됩니다
        </div>
      </div>

      <div className="marketing-pricing-grid">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`marketing-price-card marketing-price-card--full${
              plan.highlight ? " is-highlight" : ""
            }`}
          >
            {plan.badge ? (
              <span
                className="marketing-price-badge"
                style={{ background: plan.badgeColor ?? "var(--m-accent)" }}
              >
                {plan.badge}
              </span>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span className={`marketing-price-name${plan.highlight ? " is-accent" : ""}`}>
                {plan.name}
              </span>
              <p className="marketing-price-target">{plan.target}</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <div className="marketing-price-amount">
                <strong>{plan.price}</strong>
                <span>/ 월</span>
              </div>
              <span className="marketing-price-quota">{plan.quota}</span>
              <span className="marketing-price-unit">{plan.unit}</span>
            </div>
            <Link
              href={plan.href}
              className={`marketing-price-cta${plan.highlight ? " is-primary" : ""}`}
            >
              {signedIn && plan.href === "/register" ? "대시보드로 이동" : plan.cta}
            </Link>
            <div className="marketing-price-divider" />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {plan.features.map((f) => (
                <div key={f.title} className="marketing-price-feature">
                  <Check size={15} strokeWidth={2.6} />
                  <span>
                    <strong style={{ fontWeight: 600 }}>{f.title}</strong>
                    {f.note ? <small>{f.note}</small> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="marketing-contact-strip">
        <div className="marketing-contact-strip-inner">
          <div>
            <h3>월 60회로도 부족하거나, 세금계산서가 필요하신가요?</h3>
            <p>계정 공유 · 담당자별 권한 · 횟수 추가 구매를 따로 맞춰 드립니다.</p>
          </div>
          <div style={{ flex: 1 }} />
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Ditodio 요금 문의")}`}
            className="marketing-price-cta"
            style={{ flexShrink: 0 }}
          >
            문의하기
          </a>
        </div>
      </div>

      <div className="marketing-section-alt">
        <section className="marketing-section">
          <div className="marketing-section-head" style={{ marginBottom: "1.6rem" }}>
            <h2 style={{ fontSize: "clamp(1.5rem, 2.5vw, 1.85rem)" }}>요금에 대해 자주 묻는 것</h2>
          </div>
          <div className="marketing-faq-grid">
            {FAQ.map((f) => (
              <div key={f.q} className="marketing-faq-card">
                <h4>{f.q}</h4>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <MarketingFooter />
    </div>
  );
}
