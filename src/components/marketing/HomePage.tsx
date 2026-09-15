import { Check, Clapperboard } from "lucide-react";
import { Inter, Noto_Sans_KR } from "next/font/google";
import type { CSSProperties } from "react";

import { MarketingButton } from "@/components/marketing/MarketingButton";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { NewCutLink } from "@/components/NewCutLink";
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

const AUDIENCE = [
  {
    title: "1인 사장님 · 자영업",
    body: "시공이 끝난 현장에서 사진을 찍어 두고는, 정작 글을 못 씁니다. 휴대폰으로 사진을 올리고 한 줄만 적으면 그 자리에서 초안이 나옵니다.",
  },
  {
    title: "마케팅 대행사",
    body: "고객사마다 말투가 다릅니다. 말투를 따로 학습시켜 두면, 담당자가 바뀌어도 같은 말투가 유지됩니다. 최대 30개.",
  },
  {
    title: "블로그 인플루언서",
    body: "발행 주기를 지키는 게 일입니다. 내 글로 학습했으니 문체가 흔들리지 않고, 같은 소재로 쇼츠까지 이어집니다.",
  },
] as const;

const STEPS = [
  {
    num: "01",
    title: "내 글로 말투를 학습",
    body: "기존 블로그 글 2~3편을 붙여넣습니다. 문장 길이, 맺음말, 자주 쓰는 표현을 뽑아 보여 드리니 틀린 건 지우면 됩니다.",
  },
  {
    num: "02",
    title: "사진과 한 줄로 초안 생성",
    body: "사진 순서를 정리하고 무슨 작업이었는지 한 줄 적으면 됩니다. 사진 설명도 자동으로 붙습니다.",
  },
  {
    num: "03",
    title: "검수하고 복사해서 올리기",
    body: "짚어 준 곳만 확인하고 복사하면 사진까지 함께 붙습니다. 올린 주소를 넣으면 말투를 다시 학습합니다.",
  },
] as const;

const FAQ = [
  {
    q: "자동으로 발행되나요?",
    a: "아닙니다. Ditodio는 초안까지만 만듭니다. 검수하고 복사해서 직접 올리셔야 합니다. 매크로 발행은 지원하지 않습니다.",
  },
  {
    q: "네이버에서 저품질로 걸리지 않나요?",
    a: "내 글로 학습한 말투에, 직접 찍은 사진과 실제 경험이 들어갑니다. 검수 화면에서 반복 문구와 근거 없는 수치를 걸러 냅니다. 다만 발행 결과는 보장하지 않습니다.",
  },
  {
    q: "기존 글이 없으면 못 쓰나요?",
    a: "쓸 수 있습니다. 말투 학습을 건너뛰면 기본 말투로 씁니다. 다만 첫 글을 올린 뒤 주소를 넣어 주시면 그때부터 학습이 시작됩니다.",
  },
  {
    q: "해지하면 쓴 글은요?",
    a: "계정에 그대로 남습니다. 언제든 다시 시작할 수 있고, 내려받아 보관하실 수도 있습니다.",
  },
] as const;

type PricingStripItem = {
  name: string;
  price: string;
  quota: string;
  unit: string;
  cta: string;
  highlight?: boolean;
  badge?: string;
  badgeColor?: string;
};

const PRICING_STRIP: PricingStripItem[] = [
  { name: "라이트", price: "₩0", quota: "월 1회 무료 체험", unit: "자동 과금 없음", cta: "무료 체험 시작" },
  {
    name: "스탠다드",
    price: "₩9,900",
    quota: "월 15회 생성",
    unit: "1회당 약 660원",
    cta: "스탠다드 시작",
    highlight: true,
    badge: "가장 많이 선택",
  },
  {
    name: "프리미엄",
    price: "₩19,800",
    quota: "월 30회 생성",
    unit: "1회당 약 660원",
    cta: "프리미엄 시작",
    badge: "성장 운영 추천",
    badgeColor: "#7c6cf5",
  },
  { name: "엔터프라이즈", price: "₩39,500", quota: "월 60회 생성", unit: "1회당 약 658원", cta: "상담 요청" },
];

export default async function HomePage() {
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
      <MarketingNav signedIn={signedIn} active="home" />

      {/* ① 히어로 — 약속이 먼저, 방어는 나중에 */}
      <section className="marketing-hero">
        <div className="marketing-hero-inner">
          <div className="marketing-fade-up">
            <p className="marketing-kicker">블로그 초안 · 사진 정리 · 쇼츠</p>
            <h1>
              내가 쓴 것처럼
              <br />
              나오는 블로그 초안
            </h1>
            <p className="marketing-lead">
              지금까지 쓰신 글 2~3편으로 말투를 학습합니다. 현장 사진을 올리고 한 줄만 적으면, 그
              말투로 쓴 초안이 2분 안에 나옵니다. 검수하고 복사해서 올리면 끝입니다.
            </p>
            <div className="marketing-cta-row">
              {signedIn ? (
                <MarketingButton href="/dashboard">대시보드로 이동</MarketingButton>
              ) : (
                <>
                  <MarketingButton href="/register">1편 무료로 써보기</MarketingButton>
                  <MarketingButton href="/pricing" variant="secondary">
                    2분 예시 보기
                  </MarketingButton>
                </>
              )}
            </div>
            <p style={{ margin: "1rem 0 0", fontSize: "0.875rem", color: "var(--m-faint)" }}>
              카드 등록 없이 시작 · 언제든 해지
            </p>
          </div>

          <div className="marketing-editor-card marketing-fade-up-delay">
            <div className="marketing-editor-titlebar">
              <span className="marketing-editor-dot" />
              <span className="marketing-editor-dot" />
              <span className="marketing-editor-dot" />
              <div style={{ flex: 1 }} />
              <span className="marketing-editor-score is-tone">말투 96</span>
              <span className="marketing-editor-score is-seo">SEO 88</span>
            </div>
            <div className="marketing-editor-body">
              <span className="marketing-editor-brand">한빛인테리어</span>
              <h3 className="marketing-editor-title">욕실 방수 다시 잡은 이유, 3일 시공 기록</h3>
              <p className="marketing-editor-para">
                첫날은 철거부터 시작했습니다. 기존 타일을 걷어내니 방수층이 이미 갈라져
                있었습니다. 이 상태로 타일만 올리면{" "}
                <mark>다시 물이 새기 때문에</mark>, 방수를 처음부터 다시 잡았습니다.
              </p>
              <div className="marketing-editor-photo" />
              <p className="marketing-editor-para" style={{ margin: 0 }}>
                둘째 날은 방수 도포와 양생입니다. 하루를 꼬박 말려야 하는 구간이라 서두르지
                않았습니다.
              </p>
            </div>
            <div className="marketing-editor-footer">
              <span>1,820자 · 사진 6</span>
              <span className="marketing-editor-footer-cta">올리러 가기</span>
            </div>
          </div>
        </div>
      </section>

      {/* ② 신뢰 스트립 */}
      <div className="marketing-trust-row">
        <span>말투 학습 2~3편</span>
        <span className="marketing-trust-dot" />
        <span>초안 평균 1분 48초</span>
        <span className="marketing-trust-dot" />
        <span>검수는 사람이, 발행도 사람이</span>
      </div>

      {/* ③ 누구를 위한 것인가 */}
      <section className="marketing-section">
        <div className="marketing-section-head">
          <h2>글은 써야 하는데, 쓸 시간이 없는 분들</h2>
          <p>Ditodio는 세 가지 상황에서 가장 많이 쓰입니다.</p>
        </div>
        <div className="marketing-audience">
          {AUDIENCE.map((a) => (
            <div key={a.title} className="marketing-audience-card">
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ④ 자동발행기가 아니라는 증거 */}
      <div className="marketing-section-alt">
        <section className="marketing-section">
          <div className="marketing-proof">
            <div>
              <span className="marketing-proof-eyebrow">검수는 건너뛸 수 없습니다</span>
              <h2>자동으로 올려 주는 도구가 아닙니다</h2>
              <p>
                Ditodio는 초안까지만 만듭니다. 확인하고 고치고 올리는 건 사람이 합니다. 그래서
                검수 화면에 가장 공을 들였습니다 — 원문에 없는 수치, 가격 표기, 반복 문구를 문장
                단위로 짚어 줍니다.
              </p>
              <p className="marketing-proof-faint">
                매크로 자동발행이나 대량 생성은 지원하지 않습니다. 한도를 두는 이유이기도 합니다.
              </p>
            </div>
            <div className="marketing-review-card">
              <div className="marketing-review-flag">
                <span className="marketing-review-flag-badge">1</span>
                <div>
                  <p className="marketing-review-flag-title">
                    &ldquo;2년 안에&rdquo; — 사실 확인이 필요합니다
                  </p>
                  <p className="marketing-review-flag-body">
                    원문에 없는 기간입니다. 실제 경험이 맞으면 그대로 두세요.
                  </p>
                </div>
              </div>
              <div className="marketing-review-flag">
                <span className="marketing-review-flag-badge">2</span>
                <div>
                  <p className="marketing-review-flag-title">
                    &ldquo;평균 180만 원&rdquo; — 금액이 들어갔습니다
                  </p>
                  <p className="marketing-review-flag-body">
                    가격을 적으면 광고로 신고될 수 있습니다.
                  </p>
                </div>
              </div>
              <div className="marketing-review-checks">
                <div className="marketing-review-check">
                  <Check size={15} strokeWidth={2.6} />
                  사진 6장 모두 설명 있음
                </div>
                <div className="marketing-review-check">
                  <Check size={15} strokeWidth={2.6} />
                  키워드 4회 — 적정
                </div>
                <div className="marketing-review-check">
                  <Check size={15} strokeWidth={2.6} />
                  반복 문구 없음
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ⑤ 세 단계면 됩니다 */}
      <section className="marketing-section" id="steps">
        <div className="marketing-section-head">
          <h2>세 단계면 됩니다</h2>
        </div>
        <div className="marketing-steps" style={{ gap: "1rem" }}>
          {STEPS.map((step) => (
            <article
              key={step.num}
              style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}
            >
              {step.num === "01" ? (
                <div className="marketing-step-mini">
                  <span className="marketing-step-mini-bar" style={{ width: "65%" }} />
                  <span className="marketing-step-mini-bar" />
                  <span className="marketing-step-mini-bar" style={{ width: "80%" }} />
                  <div style={{ marginTop: "auto", display: "flex", gap: "0.4rem" }}>
                    <span className="marketing-step-mini-chip">짧게 끊어 쓰기</span>
                    <span className="marketing-step-mini-chip">~했습니다</span>
                  </div>
                </div>
              ) : step.num === "02" ? (
                <div className="marketing-step-mini">
                  <div className="marketing-step-mini-photos">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "center",
                      height: 34,
                      borderRadius: 9,
                      border: "1px solid var(--m-border)",
                      padding: "0 10px",
                      fontSize: "0.8rem",
                      color: "rgba(0,0,0,.75)",
                    }}
                  >
                    욕실 방수 다시 잡고 타일 재시공
                  </div>
                </div>
              ) : (
                <div className="marketing-step-mini">
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <span className="marketing-editor-score is-tone">말투 96</span>
                    <span
                      className="marketing-editor-score"
                      style={{ background: "#F4EDD8", color: "#8A6410" }}
                    >
                      확인 2
                    </span>
                  </div>
                  <span className="marketing-step-mini-bar" />
                  <span className="marketing-step-mini-bar" style={{ width: "75%" }} />
                  <span
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: 34,
                      borderRadius: 9,
                      background: "var(--m-accent)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#fff",
                    }}
                  >
                    복사해서 올리기
                  </span>
                </div>
              )}
              <div>
                <span className="marketing-step-label">{step.num}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ⑥ 현장 = 모바일 */}
      <div className="marketing-section-alt">
        <section className="marketing-section">
          <div className="marketing-field">
            <div>
              <span className="marketing-proof-eyebrow">현장에서</span>
              <h2>사진 찍은 그 자리에서 쓰세요</h2>
              <p>
                사무실에 돌아가면 안 씁니다. 휴대폰에서 사진을 고르고 한 줄 적으면, 초안이 나올
                때까지 2분입니다. 그대로 네이버 앱으로 넘어가 붙여넣기만 하면 됩니다.
              </p>
              <div className="marketing-field-checks">
                <div className="marketing-field-check">
                  <Check size={16} strokeWidth={2.6} />
                  사진 설명 자동 생성
                </div>
                <div className="marketing-field-check">
                  <Check size={16} strokeWidth={2.6} />
                  사진까지 한번에 복사
                </div>
                <div className="marketing-field-check">
                  <Check size={16} strokeWidth={2.6} />
                  앱 설치 없이 브라우저에서
                </div>
              </div>
            </div>
            <div className="marketing-phone">
              <div className="marketing-phone-header">
                <span>9:41</span>
              </div>
              <div className="marketing-phone-body">
                <h4>오늘 현장은요?</h4>
                <div className="marketing-phone-hero">
                  <span>사진 고르기</span>
                  <div className="marketing-phone-hero-thumbs">
                    <span style={{ background: "rgba(255,255,255,.22)" }} />
                    <span style={{ background: "rgba(255,255,255,.16)" }} />
                    <span style={{ background: "rgba(255,255,255,.1)" }} />
                  </div>
                </div>
                <div className="marketing-phone-secondary">주제만 적기</div>
                <div className="marketing-phone-row">
                  <span className="marketing-phone-row-thumb" />
                  <div style={{ minWidth: 0 }}>
                    <p className="marketing-phone-row-title">욕실 리모델링 3일</p>
                    <p className="marketing-phone-row-meta">검수만 남음</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ⑦ 쇼츠 */}
      <section className="marketing-section">
        <div className="marketing-bridge">
          <div>
            <p className="marketing-kicker">New Cut</p>
            <h2
              style={{
                margin: "0.6rem 0 0",
                fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
                fontWeight: 700,
                letterSpacing: "-0.035em",
              }}
            >
              쓴 글로 쇼츠까지
            </h2>
            <p className="marketing-lead" style={{ marginTop: "0.9rem" }}>
              올린 글을 그대로 쇼츠 대본으로 넘깁니다. 사진과 문단이 이미 정리돼 있으니 다시
              준비할 게 없습니다. 계정과 한도는 Ditodio 하나로 함께 씁니다.
            </p>
            <div className="marketing-cta-row">
              <NewCutLink className="marketing-btn marketing-btn-primary">
                <Clapperboard size={17} strokeWidth={1.9} />
                쇼츠 만들어 보기
              </NewCutLink>
            </div>
          </div>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid var(--m-border)",
              background: "var(--m-surface)",
              padding: "1.25rem",
              display: "flex",
              gap: "0.65rem",
            }}
          >
            {["1컷", "2컷", "3컷"].map((label) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  aspectRatio: "9 / 16",
                  borderRadius: 10,
                  background: "#ededf1",
                  display: "flex",
                  alignItems: "flex-end",
                  padding: "0.6rem",
                }}
              >
                <span style={{ fontSize: "0.656rem", fontWeight: 600, color: "rgba(0,0,0,.4)" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ⑧ 요금 (압축) */}
      <div className="marketing-section-alt">
        <section className="marketing-section">
          <div className="marketing-pricing-strip-head">
            <div>
              <h2 style={{ margin: 0 }}>생성 1회에 660원</h2>
              <p style={{ margin: "0.65rem 0 0", color: "var(--m-muted)" }}>
                먼저 1회를 무료로 써보세요. 그 뒤 자동 과금은 없습니다.
              </p>
            </div>
            <a href="/pricing" className="marketing-pricing-link">
              요금 자세히 보기 →
            </a>
          </div>
          <div className="marketing-pricing-strip">
            {PRICING_STRIP.map((p) => (
              <div
                key={p.name}
                className={`marketing-price-card${p.highlight ? " is-highlight" : ""}`}
              >
                {p.badge ? (
                  <span
                    className="marketing-price-badge"
                    style={{ background: p.badgeColor ?? "var(--m-accent)" }}
                  >
                    {p.badge}
                  </span>
                ) : null}
                <span className={`marketing-price-name${p.highlight ? " is-accent" : ""}`}>
                  {p.name}
                </span>
                <div className="marketing-price-amount">
                  <strong>{p.price}</strong>
                  <span>/ 월</span>
                </div>
                <div>
                  <div className="marketing-price-quota">{p.quota}</div>
                  <div className="marketing-price-unit">{p.unit}</div>
                </div>
                <a
                  href="/pricing"
                  className={`marketing-price-cta${p.highlight ? " is-primary" : ""}`}
                >
                  {p.cta}
                </a>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ⑨ FAQ */}
      <section className="marketing-section">
        <div className="marketing-section-head" style={{ marginBottom: "1.75rem" }}>
          <h2>궁금하실 것들</h2>
        </div>
        <div className="marketing-faq-grid">
          {FAQ.map((f) => (
            <div key={f.q} className="marketing-faq-card">
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ⑩ 마무리 CTA */}
      <section className="marketing-bottom-cta">
        <h2>오늘 현장 사진, 아직 안 쓰셨죠</h2>
        <p>지금 말투를 학습시키면 3분 안에 첫 초안이 나옵니다.</p>
        <div className="marketing-cta-row">
          {signedIn ? (
            <MarketingButton href="/dashboard">대시보드로 이동</MarketingButton>
          ) : (
            <>
              <MarketingButton href="/register">1편 무료로 써보기</MarketingButton>
              <MarketingButton href="/login" variant="secondary">
                로그인
              </MarketingButton>
            </>
          )}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
