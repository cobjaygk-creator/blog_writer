import Image from "next/image";
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

const STEPS = [
  {
    label: "Step 01",
    title: "테마에 샘플 원문을 넣고 문체 학습",
    body: "쓰고 싶은 톤의 글을 넣으면 Ditodio가 용어·호흡·마무리 패턴을 학습합니다.",
    image: "/marketing/step-learn.svg",
    reverse: false,
  },
  {
    label: "Step 02",
    title: "시공·제품·주제 모드로 초안 생성",
    body: "사진과 키워드로 초안을 만들고, 에디터에서 검수·수정한 뒤 확정합니다.",
    image: "/marketing/step-draft.svg",
    reverse: true,
  },
  {
    label: "Step 03",
    title: "복사해 네이버·티스토리에 붙여넣기",
    body: "제목·본문을 복사해 발행하고, 발행 URL을 기록해 이후 학습에 남깁니다.",
    image: "/marketing/step-publish.svg",
    reverse: false,
  },
  {
    label: "Step 04",
    title: "선택 — New Cut으로 쇼츠 제작",
    body: "같은 원소스로 쇼츠까지 이어갑니다. 포스트와 쇼츠 한도는 한 계정으로 함께 적용됩니다.",
    image: "/marketing/step-shorts.svg",
    reverse: true,
  },
] as const;

const MODES = [
  {
    title: "시공",
    body: "현장 사진과 작업 흐름에 맞춰 후기형 초안을 만듭니다.",
  },
  {
    title: "제품",
    body: "제품명·특장점·리뷰 맥락을 반영한 소개 초안을 만듭니다.",
  },
  {
    title: "주제",
    body: "키워드만으로도 논지 있는 주제형 글과 이미지를 구성합니다.",
  },
] as const;

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
      <MarketingNav signedIn={signedIn} />

      <section className="marketing-hero">
        <div className="marketing-hero-inner">
          <div className="marketing-fade-up">
            <p className="marketing-kicker">Ditodio</p>
            <h1>현장·제품 검증 초안 + 쇼츠 원소스</h1>
            <p className="marketing-lead">
              SEO 공장·매크로 자동발행기가 아닙니다. 테마 문체를 학습해 시공·제품·주제 초안을
              만들고, 복사해 네이버/티스토리에 올린 뒤 New Cut 쇼츠로 이어가세요.
            </p>
            <div className="marketing-cta-row">
              {signedIn ? (
                <MarketingButton href="/dashboard">대시보드로 이동</MarketingButton>
              ) : (
                <>
                  <MarketingButton href="/register">시작하기</MarketingButton>
                  <MarketingButton href="/login" variant="secondary">
                    로그인
                  </MarketingButton>
                </>
              )}
              <NewCutLink className="marketing-btn marketing-btn-ghost">
                New Cut 쇼츠 만들기
              </NewCutLink>
            </div>
          </div>
          <div className="marketing-visual marketing-fade-up-delay">
            <Image
              src="/marketing/hero-editor.svg"
              alt="Ditodio 에디터 미리보기 (임시 이미지)"
              width={960}
              height={640}
              priority
              unoptimized
            />
          </div>
        </div>
      </section>

      <p className="marketing-trust">테마 문체 학습 → 검수 후 발행 → New Cut 쇼츠</p>

      <section className="marketing-section">
        <div className="marketing-section-head">
          <h2>복잡하지 않습니다</h2>
          <p>네 단계면 초안부터 발행·쇼츠까지 이어집니다.</p>
        </div>
        <div className="marketing-steps">
          {STEPS.map((step) => (
            <article
              key={step.label}
              className={`marketing-step${step.reverse ? " marketing-step--reverse" : ""}`}
            >
              <div className="marketing-step-copy">
                <p className="marketing-step-label">{step.label}</p>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
              <div className="marketing-visual">
                <Image
                  src={step.image}
                  alt=""
                  width={800}
                  height={520}
                  unoptimized
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="marketing-section-alt">
        <section className="marketing-section">
          <div className="marketing-section-head">
            <h2>글의 목적에 맞는 모드</h2>
            <p>시공·제품·주제 — 필요한 흐름만 골라 초안을 만듭니다.</p>
          </div>
          <div className="marketing-modes">
            {MODES.map((mode) => (
              <div key={mode.title} className="marketing-mode">
                <h3>{mode.title}</h3>
                <p>{mode.body}</p>
              </div>
            ))}
          </div>
          <div className="marketing-visual" style={{ marginTop: "2rem" }}>
            <Image
              src="/marketing/modes-board.svg"
              alt="모드 선택 보드 (임시 이미지)"
              width={1120}
              height={420}
              unoptimized
            />
          </div>
        </section>
      </div>

      <section className="marketing-section">
        <div className="marketing-bridge">
          <div>
            <p className="marketing-kicker">New Cut</p>
            <h2 style={{ margin: "0.6rem 0 0", fontSize: "clamp(1.75rem, 3vw, 2.25rem)", fontWeight: 700, letterSpacing: "-0.035em" }}>
              포스트 원소스, 쇼츠까지 한 흐름
            </h2>
            <p className="marketing-lead" style={{ marginTop: "0.9rem" }}>
              확정한 글을 New Cut으로 넘겨 쇼츠를 만듭니다. 계정·한도는 Ditodio와 함께 적용됩니다.
            </p>
            <div className="marketing-cta-row">
              <NewCutLink className="marketing-btn marketing-btn-primary">
                New Cut 쇼츠 만들기
              </NewCutLink>
            </div>
          </div>
          <div className="marketing-visual">
            <Image
              src="/marketing/step-shorts.svg"
              alt="쇼츠 연결 미리보기 (임시 이미지)"
              width={800}
              height={520}
              unoptimized
            />
          </div>
        </div>
      </section>

      <section className="marketing-bottom-cta">
        <h2>3분이면, 첫 초안을 시작할 수 있습니다</h2>
        <p>테마를 등록하고 문체를 학습한 뒤, 바로 새 글을 만들어 보세요.</p>
        <div className="marketing-cta-row">
          {signedIn ? (
            <MarketingButton href="/dashboard">대시보드로 이동</MarketingButton>
          ) : (
            <>
              <MarketingButton href="/register">무료로 시작하기</MarketingButton>
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
