# Handoff: Ditodio 상품화 인터페이스 (홈 · 온보딩 · 모바일 · 에디터 · 랜딩 · 요금 · 위저드 · 목록 · 말투)

## Overview

Ditodio(블로그 초안 생성 + New Cut 쇼츠 허브)를 **상품으로 팔 수 있는 상태**로 만들기 위한 인터페이스 제안입니다. 현재 제품은 기능은 있으나, ① 처음 온 사용자가 무엇을 눌러야 할지 알 수 없고 ② AI 결과를 믿을 근거가 화면에 없고 ③ 발행까지 단계가 흩어져 있고 ④ 랜딩에 요금이 없어 전환이 끊깁니다. 이 핸드오프는 그 네 가지를 해결하는 11개 화면을 정의합니다.

핵심 결정 세 가지:

1. **홈은 대시보드가 아니라 입력창 하나다.** 지표는 신규 사용자에게 0이므로 홈에 두지 않는다.
2. **차별점은 현장에서 사진 찍은 그 자리에서 초안이 나오는 것이다.** 모바일은 데스크톱의 축소판이 아니라 전용 4화면.
3. **용어를 사용자 언어로 바꾼다.** `테마` → **말투**, `발행 표시` → **올림 완료로 기록**, `모드(worklog/topic/product)` → 화면에 노출하지 않고 자동 추정.

## About the Design Files

이 번들의 `Ditodio 홈 시안.dc.html`은 **디자인 레퍼런스(HTML 프로토타입)**입니다. 프로덕션 코드가 아니며, 그대로 복사해 쓰는 것을 의도하지 않았습니다.

구현 대상은 기존 코드베이스인 **Next.js (App Router) + React + TypeScript + Tailwind CSS v4** 환경이며, 이 HTML에 보이는 레이아웃·색·타이포·문구를 그 환경의 기존 패턴으로 **재현**하는 것이 과제입니다. 구체적으로:

- 색·폰트·radius는 이미 `src/app/globals.css`의 CSS 변수와 Tailwind 유틸로 존재합니다. **새 토큰을 만들지 말고 기존 것을 쓰십시오.** (아래 Design Tokens 참조)
- 버튼/배지 등은 `src/components/ui/button.tsx`, `badge.tsx`의 기존 variant를 씁니다.
- 이 HTML은 모든 스타일이 인라인입니다. 이는 프로토타입 도구의 제약이며, **구현 시에는 Tailwind 클래스로 옮겨야 합니다.**
- 아이콘은 전부 `lucide-react`의 실제 아이콘 path입니다. 구현 시 `lucide-react` 컴포넌트로 교체하십시오 (매핑은 각 화면 설명에 명시).

프로토타입을 열려면 `Ditodio 홈 시안.dc.html`과 `support.js`를 같은 폴더에 두고 HTML을 브라우저에서 엽니다. 좌우/위아래로 팬·줌이 가능한 캔버스이며, 위에서 아래로 TURN 5 → TURN 1 순서(최신 제안이 위)입니다.

## Fidelity

**High-fidelity (hifi).** 색상 hex, px 단위 폰트 크기·간격, radius, 그림자, 문구가 모두 최종 의도값입니다. 픽셀 단위로 재현하십시오.

두 가지 예외:

- **이미지 자리**는 전부 회색 박스(`#EDEDF1` / `#E6E6EB`)로 처리돼 있습니다. 실제 사진·캡처로 교체해야 합니다.
- **차트/스파크라인**은 예시 데이터의 SVG polyline입니다. 실제 데이터로 렌더해야 합니다.

## 화면 목록과 구현 우선순위

| 우선순위 | ID | 화면 | 대상 라우트(제안) |
|---|---|---|---|
| 1 | `1b` | 홈 — "한 줄로 시작" | `/dashboard` (전면 교체) |
| 2 | `2b` | 모바일 4화면 (현장 → 초안 → 발행) | `/m/*` 또는 기존 라우트의 반응형 분기 |
| 3 | `2a` | 온보딩 3단계 | `/onboarding` (신규) |
| 4 | `3a` `3b` | 에디터 검수 + 발행 시트 | `/posts/[id]` |
| 5 | `4a` `4b` | 랜딩 · 요금 | `/` , `/pricing` (신규) |
| 6 | `5a` | 새 글 (모드 선택 제거) | `/posts/new` |
| 7 | `5b` | 내 글 (표 + 보드 전환) | `/posts` |
| 8 | `5c` | 말투 학습 | `/brands/[id]` → `/voices/[id]` |
| — | `1c` | 대행사용 작업 보드 | `5b`의 "보드" 탭으로 편입 |
| — | `1d` | 성과 리포트 | **홈에 두지 말 것.** 월초 이메일 + `/billing`에서 재사용 |
| 참조 | `1a` | 현재 화면 재현 (as-is) | 구현 대상 아님 — 비교 기준선 |

---

## Screens / Views

### 1b — 홈 "한 줄로 시작" (최우선)

**Purpose.** 사용자가 홈에 도착해서 내리는 결정은 하나여야 한다: "무엇에 대해 쓸까". 지표·표·사용량은 전부 접는다.

**Layout.**
- 좌측 레일 `width: 80px`, `background: #fff`, `border-right: 1px solid #E8E8EC`. (현재 64px에서 넓힘 — 밀도 완화)
  - 로고 영역 `height: 64px`, 중앙 정렬. 로고 = `32×32`, `border-radius: 10px`, `background: #4B3BFF`, 텍스트 "Di" `13px/700 #fff`.
  - nav 항목: `flex-direction: column`, `gap: 6px`, `padding: 12px 4px`, `border-radius: 12px`, 라벨 `10.5px/600`. 아이콘 `20×20`, `stroke-width: 1.7`.
    - 활성: `background: #EFEDFF`, `color: #4B3BFF`. 비활성: `color: #8A8A94`.
  - 항목 4개: **홈**(`House`), **내 글**(`FolderOpen`), **말투**(`Palette`), **쇼츠**(`Clapperboard`). 설정·요금은 하단 아바타 메뉴로 이동.
  - 하단: 아바타 `32×32`, `border-radius: 50%`, `background: #16161A`, 이니셜 `11.5px/700 #fff`. `padding: 14px 0 18px`.
- 본문 영역 `background: #F6F6F8` (현재 `#F3F3F5`보다 살짝 밝게).
  - 헤더 `height: 64px`, `padding: 0 32px`, 배경 없음(투명). 우측에 사용량 pill + 도움말.
    - 사용량 pill: `height: 32px`, `border-radius: 9999px`, `background: #fff`, `border: 1px solid #E8E8EC`, `padding: 0 14px`, `font-size: 12px`, `color: #6B6B75`. 내부에 굵은 숫자(`#16161A`, `tabular-nums`)와 `56×5` 프로그레스(트랙 `#EDEDF1`, 채움 `#4B3BFF`, `border-radius: 9999px`).
  - 콘텐츠 컬럼: `max-width: 760px`, 중앙 정렬, `padding: 26px 32px 0`, `gap: 14px`.

**Components.**

1. **인사 블록** — `gap: 6px`
   - h2 `26px/700`, `letter-spacing: -.025em`. 문구: `안녕하세요, {이름}님 👋`
   - p `14.5px`, `color: #6B6B75`. 문구: `오늘은 무엇에 대해 쓸까요? 한 줄만 적으면 나머지는 제가 정리합니다.`
   - ⚠️ 이 화면의 👋가 프로토타입 유일한 이모지입니다. 브랜드가 이모지를 쓰지 않는다면 제거하십시오.

2. **시작 카드 (화면의 주역)** — `border-radius: 18px`, `border: 1px solid #E0E0E6`, `background: #fff`, `box-shadow: 0 2px 10px rgba(22,22,26,.05)`, `padding: 18px 18px 14px`, `gap: 14px`
   - **입력행**: `Sparkles` 아이콘 `22×22 #4B3BFF` + 입력 텍스트 `18px/500`. placeholder는 `13px #B4B4BE`: `예: "신메뉴 밤 라떼 소개" · "원목 식탁 도장 후기"`
     - 실제 구현은 `<textarea>` 1줄 자동확장 권장. 엔터로 제출, Shift+엔터로 개행.
   - 구분선 `height: 1px`, `background: #F0F0F3`
   - **말투 칩 행**: 라벨 `말투` `12.5px/600 #9C9CA6` + 칩들
     - 선택 칩: `height: 32px`, `border-radius: 9999px`, `background: #EFEDFF`, `border: 1px solid #D9D4FF`, `padding: 0 12px`, `12.5px/600 #4B3BFF`. 버전 배지는 같은 색 `10.5px/700 opacity .75`.
     - 미선택 칩: `border: 1px solid #E8E8EC`, `background: #fff`, `12.5px/500 #6B6B75`.
     - "새 말투" 칩: `border: 1px dashed #D4D4DB`, `Plus` 아이콘 `14×14`.
   - **사진 드롭존 + CTA** 한 행 `gap: 12px`
     - 드롭존 `flex: 1`, `border-radius: 12px`, `border: 1px dashed #D4D4DB`, `background: #FBFBFC`, `padding: 12px 14px`. `Image` 아이콘 `18×18 #B4B4BE` + `13px #8A8A94` 텍스트 `현장 사진을 여기에 끌어다 놓으세요` + `#B4B4BE`로 `· 없어도 시작할 수 있어요`
     - CTA `height: 48px`, `border-radius: 12px`, `background: #4B3BFF`, `box-shadow: 0 2px 6px rgba(75,59,255,.35)`, `padding: 0 24px`, `15px/600 #fff`, `ArrowRight` `17×17`. 문구: `글 만들기`
   - **각주** `12px #B4B4BE`: `사진을 올리면 시공 · 제품 · 주제 중 맞는 형식을 자동으로 골라 드립니다. 평균 1분 48초.`

3. **"이어서 하기" 카드 3개** — `grid-template-columns: repeat(3, minmax(0,1fr))`, `gap: 12px`
   - 카드: `border-radius: 14px`, `border: 1px solid #E8E8EC`, `background: #fff`, `padding: 14px`, `gap: 10px`
   - 상태 배지 `height: 21px`, `border-radius: 6px`, `padding: 0 8px`, `10.5px/700`
     - 검수 대기: `background: #EFEDFF`, `color: #4B3BFF`, 문구 `검수만 남음`
     - 사진 설명 필요: `background: #F4EDD8`, `color: #8A6410`, 문구 `사진 설명 {n}개`
   - 시간 `11px #B4B4BE`, 우측 정렬
   - 제목 `14px/600`, `line-height: 1.45`
   - 메타 `12px #9C9CA6`, `tabular-nums`: `{말투} · 사진 {n} · {글자수}자`
   - 카드 CTA `height: 34px`, `border-radius: 9px`
     - 주 액션: `background: #16161A`, `12.5px/600 #fff`, 문구 `검수하고 올리기`
     - 보조: `border: 1px solid #E0E0E6`, `background: #fff`, `color: #3A3A44`, 문구 `사진 설명 채우기`
   - 섹션 헤더: `이어서 하기` `14px/700` + 카운트 배지(`#F0F0F3` / `#6B6B75`) + 우측 `내 글 전체 →` `12.5px/600 #8A8A94`

4. **미학습 말투 넛지 바** — `border-radius: 14px`, `background: #fff`, `border: 1px solid #E8E8EC`, `padding: 13px 16px`
   - 아이콘 박스 `30×30`, `border-radius: 9px`, `background: #EFEDFF`, `color: #4B3BFF`, `Palette` `17×17`
   - 제목 `13px/600`: `'{말투명}' 말투는 아직 학습 전입니다`
   - 설명 `12px #9C9CA6`: `기존 블로그 글 2~3편만 붙여넣으면 그 말투로 씁니다.`
   - CTA `height: 32px`, `border: 1px solid #E0E0E6`, `12.5px/600 #3A3A44`, 문구 `말투 학습`
   - **조건부 렌더**: 미학습 말투가 하나 이상일 때만.

**Interactions.**
- 입력창 포커스 시 카드 border `#4B3BFF`로, `border-width` 유지(1px→1.5px는 레이아웃 시프트 유발하므로 `box-shadow: 0 0 0 1px #4B3BFF` 사용 권장).
- 사진 드롭 → 모드 자동 추정 → 시작 카드 하단에 추정 결과 칩 표시(`5a`의 "시공 · 후기로 판단했습니다" 칩과 동일 스타일).
- `글 만들기` 클릭 → 생성 상태로 전환. 데스크톱은 `/posts/[id]`로 이동하며 스트리밍, 모바일은 `2b`의 ③ 전용 화면.
- 카드 hover: `border-color: #D4D4DB`, `box-shadow: 0 2px 8px rgba(22,22,26,.06)`, `transition: 140ms ease`.

**State.** `topic: string`, `selectedVoiceId: string`, `photos: File[]`, `inferredMode: 'worklog'|'topic'|'product'|null`, `continueItems: PostSummary[]`, `usage: {used, limit}`, `unlearnedVoices: Voice[]`

---

### 2a — 온보딩 3단계

**Purpose.** 가입 → 첫 글까지. 화면당 결정 하나. 레일·지표 전부 숨김.

**공통 레이아웃.** `700×620` 카드형(실제 구현은 화면 중앙 `max-width: 700px`). `background: #fff`.
- 헤더 `height: 60px`, `padding: 0 26px`: 로고 `26×26` + 우측 진행 표시
  - 진행 점: `height: 6px`, `width: 26px`, `border-radius: 9999px`. 완료/현재 `#4B3BFF`, 미완 `#EDEDF1`. `gap: 6px`
  - `1 / 3` `12px/600 #B4B4BE`, `tabular-nums`
- 본문 `padding: 14px 46px 0`, `gap: 18px`
- 푸터 `height: 78px`, `border-top: 1px solid #F0F0F3`, `padding: 0 46px`
  - 좌측 텍스트 링크 `13px/600 #8A8A94`, 우측 주 CTA `height: 46px`, `border-radius: 11px`, `background: #4B3BFF`, `15px/600 #fff`

**Step 1 — 말투 학습 입력**
- h2 `25px/700`, `letter-spacing: -.025em`: `어떤 말투로 써 드릴까요?`
- p `14px #6B6B75`: `지금까지 쓰신 블로그 글 2~3편만 붙여넣으세요. 그 글의 어투와 호흡을 그대로 따라 씁니다.`
- 이름 입력 `height: 46px`, `border-radius: 11px`, `border: 1px solid #E0E0E6`, `padding: 0 14px`, `15px/500`
- 등록된 원문 카드: `border-radius: 11px`, `border: 1px solid #E8E8EC`, `background: #FBFBFC`, `padding: 12px 14px`. `Check` `17×17 #0F7B52` + 제목 `13.5px/600`(1줄 ellipsis) + `11.5px #9C9CA6 tabular-nums` 글자수
- 추가 버튼: `border: 1px dashed #D4D4DB`, `padding: 15px`, `13.5px/600 #8A8A94`, 문구 `글 붙여넣기 · URL로 가져오기`
- 카운트 배지 `background: #E7F5EF`, `color: #0F7B52`: `{n}편 등록됨`. 우측 힌트 `12px #B4B4BE`: `최소 1편, 3편 권장`
- 푸터: `먼저 둘러볼게요` (skip) / `말투 학습하기`

**Step 2 — 학습 결과 확인 (이 온보딩의 핵심)**
> "완료" 대신 **추출한 특징 + 실제 예시 문장**을 보여줘 신뢰를 만드는 화면입니다. 축약하지 마십시오.

- 상단 배지 `height: 24px`, `border-radius: 7px`, `background: #E7F5EF`, `11.5px/700 #0F7B52`, `Check` `14×14`: `학습 완료 · {n}초`
- h2: `이렇게 쓰시는 분이군요`
- p: `두 편에서 찾아낸 말투 특징입니다. 틀린 게 있으면 지금 지워 주세요 — 앞으로 쓰는 모든 글에 적용됩니다.`
- **특징 카드 2×2** `gap: 10px`: `border-radius: 12px`, `border: 1px solid #E8E8EC`, `background: #FBFBFC`, `padding: 14px 15px`
  - 라벨 `11.5px/600 #9C9CA6` / 값 `14px/600`
  - 4개: `문장 길이` → `짧게 끊어 쓰기 · 평균 38자` / `맺음말` → `"~했습니다" 존댓말 고정` / `자주 쓰는 표현` → `방수, 양생, 하자, 실측` / `글 구조` → `날짜별 기록 → 마무리 정리`
  - 값은 `style-rules.ts`의 추출 결과에서 채웁니다.
- **예시 문장 카드**: `border-radius: 12px`, `border: 1px solid #D9D4FF`, `background: #F7F6FF`, `padding: 15px 16px`
  - 라벨 `12px/700 #4B3BFF`: `이 말투로 쓰면 이런 문장이 나옵니다`
  - 본문 `14px`, `line-height: 1.7`, `color: #3A3A44`. **실제 모델 생성 결과를 넣어야 합니다** (하드코딩 금지).
- 하단 안내: `background: #FBFBFC`, `border: 1px solid #F0F0F3`, `Clock` `16×16 #B4B4BE`, `12.5px #6B6B75`: `글을 올릴 때마다 말투는 계속 정교해집니다. 지금은 2편 기준입니다.`
- 푸터: `글 더 넣기`(보조, `border: 1px solid #E0E0E6`) / `맞습니다, 계속`

**Step 3 — 첫 글 시작**
- h2: `첫 글, 바로 만들어 봅시다`
- p: `한 줄만 적으면 됩니다. 결과가 마음에 안 들면 버리셔도 이번 달 한도에서 빠지지 않습니다.`
  - ⚠️ 이 문구는 요금 정책에 종속됩니다. 현재 요금 모델(회차 기준)에서는 "생성을 실행하면 1회 집계"이므로 **정책 확정 후 문구를 맞춰야 합니다.**
- 시작 카드: `1b`의 시작 카드와 동일 구조, `border-radius: 16px`, CTA는 입력 전 비활성(`background: #EDEDF1`, `color: #B4B4BE`)
- **주제 추천 칩**: `height: 36px`, `border-radius: 9999px`, `border: 1px solid #E8E8EC`, `13px/500 #3A3A44`. 라벨 `12.5px/600 #9C9CA6`: `이런 주제로 많이 쓰십니다 — 눌러서 바로 시작`
  - 학습한 원문의 주제에서 추출. 없으면 이 블록 숨김.
- **모바일 유도 바** (`margin-top: auto`): `background: #FBFBFC`, `border: 1px solid #F0F0F3`, `padding: 13px 15px`
  - `12.5px #6B6B75`: `현장에서 찍은 사진이 있다면 휴대폰으로 쓰는 게 훨씬 빠릅니다. 문자로 링크를 보내 드릴까요?` + CTA `링크 받기`
- 이 단계에 푸터 없음(카드 내부에서 끝남).

---

### 2b — 모바일 4화면 (`390×844` 기준, iPhone 14/15)

**전역 규칙.**
- 모든 탭 타깃 **≥ 48px**. 주 CTA `height: 56px`.
- 하단 탭바 `height: 76px` (`padding-bottom: 14px`로 홈 인디케이터 회피), `border-top: 1px solid #E8E8EC`, `background: #fff`. 3개: 홈 / 내 글 / 쇼츠. 아이콘 `22×22`, 라벨 `10.5px/600`. 활성 `#4B3BFF`, 비활성 `#8A8A94`.
- 편집·말투 관리·설정은 **모바일에서 제외**하고 데스크톱에 남깁니다.

**① 홈** — `background: #F6F6F8`
- 상단 바 `height: 54px`, `padding: 0 20px`: 로고 `30×30` + 사용량 pill(`height: 30px`, `border-radius: 9999px`, `12px #6B6B75`) + 아바타 `34×34`
- h2 `24px/700`: `오늘 현장은요?` / p `14px #6B6B75`: `사진부터 고르면 나머지는 제가 씁니다.`
- **주역 카드**: `border-radius: 20px`, `background: #4B3BFF`, `box-shadow: 0 6px 18px rgba(75,59,255,.3)`, `padding: 22px`
  - 아이콘 박스 `48×48`, `border-radius: 14px`, `background: rgba(255,255,255,.18)`, `Image` `24×24 #fff`
  - 제목 `17px/700 #fff`: `사진 고르기` / 부제 `12.5px rgba(255,255,255,.78)`: `최근 사진 {n}장 · 오늘 촬영`
  - 썸네일 4칸 `height: 64px`, `border-radius: 11px`, `background: rgba(255,255,255,.22 → .1)` 단계적
- 보조 CTA `height: 52px`, `border-radius: 14px`, `border: 1px solid #E0E0E6`, `background: #fff`, `14.5px/600 #3A3A44`: `사진 없이 주제만 적기`
- 이어서 하기 리스트: `border-radius: 14px`, `border: 1px solid #E8E8EC`, `background: #fff`, `padding: 14px`. 썸네일 `46×46`, `border-radius: 10px`. 제목 `14px/600`, 메타 `12px #9C9CA6`, 우측 `ChevronRight` `19×19 #C2C2CC`

**② 사진 정리 + 한 줄** — `background: #fff`
- 상단 바 `height: 54px`, `border-bottom: 1px solid #F0F0F3`: `ChevronLeft` `22×22`(탭 영역 `36×36`) + `사진 {n}장` `15px/700` + 우측 `추가` `13.5px/600 #4B3BFF`
- 입력 카드: `border-radius: 14px`, `border: 1.5px solid #4B3BFF`, `padding: 14px`
  - 라벨(카드 밖) `13px/600 #6B6B75`: `무슨 작업이었나요?` + `#B4B4BE` `한 줄이면 됩니다`
  - 입력 `16px/500`, `line-height: 1.5` (iOS 자동 줌 방지 위해 **16px 미만 금지**)
  - 말투 칩 `height: 34px`
- 사진 그리드 `repeat(2, 1fr)`, `gap: 9px`
  - 카드 `border-radius: 12px`, `border: 1px solid #E8E8EC`, overflow hidden
  - 이미지 `height: 96px`. 좌상단 순번 배지 `22×22`, `border-radius: 7px`, `background: rgba(22,22,26,.72)`, `11px/700 #fff`
  - 캡션 영역 `padding: 9px 10px`, `11.5px #6B6B75`. 빈 캡션은 `#B4B4BE`로 `설명 없음 — 자동 생성`
  - 헤더: `사진 순서` + `길게 눌러 옮기기` `12px #B4B4BE` + 우측 `설명 자동` 토글 배지(`background: #EFEDFF`, `#4B3BFF`, `Sparkles` `13×13`)
- 하단 고정 바 `padding: 14px 20px 26px`, `border-top: 1px solid #F0F0F3`
  - CTA `height: 56px`, `border-radius: 15px`, `background: #4B3BFF`, `16px/600 #fff`: `초안 만들기`
  - 각주 중앙 `11.5px #B4B4BE`: `약 1분 50초 · 이번 달 {used}/{limit}`

**③ 생성 중 (다크)** — `background: #16161A`, `color: #fff`
> 대기 이탈을 막는 화면입니다. "로딩 스피너"로 대체하지 마십시오.
- 본문 중앙 정렬, `padding: 0 30px`, `gap: 34px`
- 레이블 `12px/700`, `letter-spacing: .09em`, `color: #8B8B98`: `초안 만드는 중`
- h2 `27px/700`, `line-height: 1.35`: `사진 6장을 읽고 / 말투를 맞추고 있습니다`
- **단계 리스트** `gap: 16px`
  - 완료: 원 `26×26`, `background: #0F7B52`, `Check` `15×15 #fff` + 텍스트 `15px/500 #f2f2f5` + 우측 소요시간 `12.5px #63636f tabular-nums`
  - 진행 중: 원 `background: #8b7cff`, `Sparkles` `15×15 #16161A` + 텍스트 `15px/600 #fff`
  - 대기: 원 `border: 1.5px solid #63636f`, 투명 배경, 컨테이너 `opacity: .45`, 텍스트 `#8b8b98`
  - 단계 문구: `사진에서 작업 순서 읽기` / `사진 설명 {n}개 붙이기` / `'{말투}' 말투로 문단 쓰기` / `제목 3개 뽑기`
- 프로그레스 `height: 6px`, 트랙 `#26262f`, 채움 `#8b7cff`. 하단 `12.5px #8b8b98`: `{경과} 지남 · 평균 1분 48초`
- **먼저 나온 문장 카드**: `border-radius: 14px`, `background: #1a1a21`, `border: 1px solid #26262f`, `padding: 15px 16px`. 라벨 `11.5px/700 #8b7cff` + 본문 `14px/1.7 #c9c9d2`. **스트리밍 첫 문단을 실시간으로 흘립니다.**
- 하단 `height: 52px`, `border: 1px solid #332c52`, `14.5px/600 #8b8b98`: `닫아도 계속 만듭니다`

**④ 초안 확인 → 발행**
- 상단 바: `ChevronLeft` + `초안` `15px/700` + 점수 배지 2개(`말투 96` `#E7F5EF`/`#0F7B52`, `SEO 88` `#EFEDFF`/`#4B3BFF`), `height: 24px`, `border-radius: 7px`, `11.5px/700`
- 제목 영역: 라벨 `12px/600 #9C9CA6` `제목 — 눌러서 바꾸기` + h2 `20px/700`, `line-height: 1.4` + 대안 제목 칩(`height: 30px`, `border-radius: 9999px`, `12px #6B6B75`)
- 본문 미리보기 `15px`, `line-height: 1.75`, `color: #27272a`. 이미지 `border-radius: 10px`, 캡션 `12px #9C9CA6` 중앙
- 하단 고정 바 `padding: 12px 20px 26px`
  - 보조 2개 `height: 50px`, `border-radius: 14px`, `border: 1px solid #E0E0E6`: `다시 쓰기`(`Sparkles`) / `쇼츠로`(`Clapperboard`)
  - 주 CTA `height: 56px`, `border-radius: 15px`, `background: #4B3BFF`, `16px/600 #fff`: `복사해서 네이버 앱 열기`
  - 각주 `11.5px #B4B4BE`: `사진까지 함께 복사됩니다 · 붙여넣기만 하세요`
- **구현 주의**: 클립보드 쓰기는 사용자 제스처 안에서 실행되어야 합니다(`navigator.clipboard.write` with `ClipboardItem` — HTML + 이미지). iOS Safari는 `text/html` MIME을 지원하나 이미지 다중 첨부는 제약이 있으니, 실패 시 "본문만 복사 + 사진은 앨범에 저장" 폴백을 준비하십시오. 네이버 앱 딥링크(`naversearchapp://` 등)는 실기기 검증이 필요합니다.

---

### 3a — 에디터: 검수를 본문 옆으로

**바뀐 것 4가지 (구현 시 반드시 반영).**
1. **저장 버튼 제거.** 자동 저장. 헤더에 `Check` `13×13` + `11.5px #B4B4BE` `자동 저장됨`.
2. 검수 항목이 **본문 문장에 직접 하이라이트**되고, 우측 패널에서 누르면 그 문장으로 스크롤.
3. 점수는 숫자만이 아니라 **근거 문장**을 함께.
4. 발행 관련 버튼을 **하단 바 한 곳**으로 통합.

**Layout.** `grid-template-columns: 104px 1fr 336px`, 그 아래 하단 액션 바 `height: 68px`.
- 헤더 `height: 52px`, `background: #fff`, `border-bottom: 1px solid #E8E8EC`, `padding: 0 16px`
  - `ChevronLeft` `18×18 #C2C2CC` + 제목 `17.5px/700`, `letter-spacing: -.02em`, 1줄 ellipsis + 자동저장 표시
  - 우측: 말투 pill(`height: 28px`, `border-radius: 8px`, `background: #F0F0F3`, `11.5px/600 #6B6B75`) + `미리보기`(`border: 1px solid #E0E0E6`)
- **좌측 사진 레일** `width: 104px`, `background: #fff`, `border-right: 1px solid #E8E8EC`, `padding: 12px 10px`, `gap: 7px`
  - 라벨 `10px/700`, `letter-spacing: .05em`, `#B4B4BE`: `사진 {n}`
  - 썸네일 `height: 56px`, `border-radius: 8px`. 선택 시 `border: 1.5px solid #4B3BFF`
  - 추가 버튼 `height: 36px`, `border: 1px dashed #D4D4DB`, `Plus` `15×15`
- **본문** `background: #F3F3F5`, `padding: 20px 0 0`, 중앙 정렬
  - 종이 `max-width: 660px`, `border-radius: 12px`, `border: 1px solid #E8E8EC`, `background: #fff`, `box-shadow: 0 1px 3px rgba(0,0,0,.04)`, `padding: 34px 42px`
  - 말투 라벨 `11px/700`, `letter-spacing: .05em`, `#4B3BFF`
  - h2 `26px/700`, `line-height: 1.35`, `letter-spacing: -.02em`
  - 본문 `15px`, `line-height: 1.75`, `color: #27272a`, 단락 `margin-bottom: 12px`
  - **검수 하이라이트**: `background: #FCF3DA`, `border-bottom: 2px solid #E0A93C`, `padding: 1px 0`. 뒤에 번호 배지 `min-width: 16px`, `height: 16px`, `border-radius: 5px`, `background: #E0A93C`, `10px/700 #fff`, `margin-left: 4px`, `vertical-align: 2px`
  - 이미지 `border-radius: 8px`, 캡션 `12px #9C9CA6` 중앙
- **우측 패널** `width: 336px`, `background: #fff`, `border-left: 1px solid #E8E8EC`
  - 탭 바 `height: 44px`, `padding: 0 12px`, `gap: 4px`. 탭 `height: 28px`, `border-radius: 8px`, `padding: 0 11px`, `12px`. 활성 `background: #16161A`, `#fff`, `600`; 비활성 `#8A8A94`, `500`. 탭: `검수 {n}` / `사진 {n}` / `다시 쓰기`
  - **점수 카드** `border-radius: 12px`, `border: 1px solid #E8E8EC`, `background: #FBFBFC`, `padding: 14px`
    - 도넛: `svg 52×52`, `viewBox 0 0 36 36`, `circle r=15.5`, 트랙 `#EDEDF1` `stroke-width: 4`, 채움 `#4B3BFF`, `stroke-dasharray: 97.4`(= 2πr), `stroke-dashoffset: 97.4 × (1 - score/100)`, `transform: rotate(-90 18 18)`, `stroke-linecap: round`. 중앙 숫자 `14px/700 tabular-nums`
    - 제목 `13.5px/700`: `내 말투와 {n}% 일치`
    - **근거** `11.5px/1.45 #9C9CA6`: `짧은 문장 · "~했습니다" 맺음 · 날짜별 기록 구조가 지켜졌습니다.` ← 실제 규칙 매칭 결과로 생성
    - SEO 행: 라벨 `12.5px #6B6B75` + 바(`height: 5px`, 트랙 `#EDEDF1`, 채움 `#4B3BFF`) + 숫자 `12.5px/700 tabular-nums`
  - **확인 필요 항목** — `border-radius: 11px`, `border: 1px solid #F0DFB4`, `background: #FDF9EE`, `padding: 12px`, `gap: 9px`
    - 번호 배지 `18×18`, `background: #E0A93C`, `10.5px/700 #fff`
    - 제목 `12.5px/600 #6B4E10`, 설명 `11.5px/1.5 #8A6410`
    - 액션 2개 `height: 30px`, `border-radius: 8px`, `11.5px/600`: 주 `background: #16161A`/`#fff` `문장으로 가기`, 보조 `border: 1px solid #E0D3AC`/`background: #fff`/`#8A6410`
    - 예시 항목: `"2년 안에" — 사실 확인이 필요합니다` / `원문에 없는 기간입니다. 실제 경험이 맞으면 그대로 두세요.` · `"평균 180만 원" — 금액이 들어갔습니다` / `가격을 적으면 광고로 신고될 수 있습니다. 범위로 바꾸거나 빼는 게 안전합니다.`
    - ⚠️ **검수 항목 목록은 실제 서비스 정책으로 확정해야 합니다.** 위 두 개는 디자인 예시입니다.
  - **통과 항목** `12.5px/700 #9C9CA6` 헤더 + 행 `12px #6B6B75` + `Check` `14×14 #0F7B52`
- **하단 액션 바** `height: 68px`, `background: #fff`, `border-top: 1px solid #E8E8EC`, `padding: 0 20px`
  - 좌측 메타 `12px #9C9CA6 tabular-nums`: `{n}자 · 사진 {n} · 예상 읽기 {n}분`
  - `쇼츠로 잇기` `height: 42px`, `border-radius: 11px`, `border: 1px solid #E0E0E6`, `13px/600 #3A3A44`, `Clapperboard` `16×16`
  - `올리러 가기` `height: 42px`, `background: #4B3BFF`, `box-shadow: 0 2px 6px rgba(75,59,255,.35)`, `14px/600 #fff`, `ArrowRight` `17×17`

### 3b — 발행 시트

**Purpose.** 기존의 흩어진 5단계(저장 → 복사 → 붙여넣기 → 발행 표시 → URL 입력)를 한 시트로. **열리는 순간 이미 복사 완료 상태.**

- 오버레이 `rgba(22,22,26,.42)`
- 시트 `width: 560px`, 중앙, `border-radius: 18px`, `background: #fff`, `box-shadow: 0 24px 60px rgba(22,22,26,.28)`
- 헤더 `padding: 22px 26px 0`: h3 `20px/700`, `letter-spacing: -.02em` `올릴 준비가 됐습니다` + p `13px #6B6B75` `제목 · 본문 · 사진 {n}장이 클립보드에 복사됐습니다.` + 닫기 `30×30`
- 본문 `padding: 20px 26px 0`, `gap: 14px`
  1. **복사 완료 배너** `border-radius: 12px`, `background: #E7F5EF`, `padding: 14px 15px`. 원 `26×26`, `background: #0F7B52`, `Check` `15×15 #fff` + `13.5px/600 #0F7B52` `복사 완료 — 붙여넣기만 하면 됩니다`
  2. **플랫폼 선택** 3개 `height: 46px`, `border-radius: 11px`. 선택: `border: 1.5px solid #4B3BFF`, `background: #F7F6FF`, `13.5px/600 #4B3BFF`. 미선택: `border: 1px solid #E0E0E6`, `13.5px/500 #3A3A44`. 라벨 `네이버 블로그` / `티스토리` / `그 외`
  3. **주 CTA** `height: 52px`, `border-radius: 12px`, `background: #4B3BFF`, `15px/600 #fff`: `네이버 글쓰기 열고 붙여넣기`
  4. 구분선 `#F0F0F3`
  5. **URL 입력** — 라벨 `12.5px/600 #6B6B75` `올린 뒤, 글 주소를 여기에` + `선택` 배지(`#F0F0F3`/`#8A8A94`, `10px/700`). 입력 `height: 46px`, `border-radius: 11px`, `border: 1px solid #E0E0E6`, `13.5px`, placeholder `#B4B4BE` `blog.naver.com/...`
  6. **이득 설명** `border-radius: 11px`, `background: #FBFBFC`, `border: 1px solid #F0F0F3`, `padding: 12px 13px`. `Palette` `15×15 #4B3BFF` + `12px/1.55 #6B6B75`: `주소를 넣으면 실제로 올린 최종본을 읽어 말투를 다시 학습합니다. 직접 고친 부분까지 반영돼 다음 글이 더 비슷해집니다.`
- 푸터 `padding: 20px 26px 22px`: `주소는 나중에` `13px/600 #8A8A94` / `올림 완료로 기록` `height: 44px`, `background: #16161A`, `14px/600 #fff`
- **용어**: 기존 "발행 표시"는 쓰지 않습니다.

---

### 4a — 랜딩

**순서 변경이 핵심.** 현재 랜딩은 "SEO 공장·매크로 자동발행기가 아닙니다"라는 **부정문**으로 시작합니다. 방어는 필요하지만 첫 문장은 약속이어야 합니다.

새 섹션 순서: ① 히어로(약속) → ② 신뢰 스트립 → ③ 누구를 위한 것인가 → ④ **자동발행기가 아니라는 증거(검수 화면 실물)** → ⑤ 3단계 → ⑥ 현장 = 모바일 → ⑦ 쇼츠 → ⑧ 요금 → ⑨ FAQ → ⑩ 마무리 CTA

**스타일 기준.** 이 화면만 `marketing.css` 계열 색을 씁니다 (앱 화면과 다름):
- accent `#5e56f0`, bg `#f7f7f8`, surface `#fff`, border `#efeff0`
- 텍스트 `rgba(0,0,0,.85)` / `.6` / `.55` / `.4`
- nav `height: 62px`, `padding: 0 40px`. 로고 `20px/700`, `letter-spacing: -.03em`. 링크 `14.5px/500`. CTA `height: 40px`, `border-radius: 10px`, `background: #5e56f0`, `15px/600 #fff`
- 콘텐츠 `max-width: 1040px`, `padding: 66~72px 40px`

**히어로** — `grid-template-columns: 1.05fr .95fr`, `gap: 48px`
- eyebrow `14px/600 #5e56f0`: `블로그 초안 · 사진 정리 · 쇼츠`
- h2 `52px/700`, `letter-spacing: -.04em`, `line-height: 1.12`: `내가 쓴 것처럼 / 나오는 블로그 초안`
- p `17px/1.7 rgba(0,0,0,.55)`, `max-width: 490px`: `지금까지 쓰신 글 2~3편으로 말투를 학습합니다. 현장 사진을 올리고 한 줄만 적으면, 그 말투로 쓴 초안이 2분 안에 나옵니다. 검수하고 복사해서 올리면 끝입니다.`
- CTA `height: 52px`, `border-radius: 11px`, `16px/600`. 주 `background: #5e56f0`/`#fff` `1편 무료로 써보기`, 보조 `border: 1px solid #efeff0` `2분 예시 보기`
- 각주 `14px rgba(0,0,0,.4)`: `카드 등록 없이 시작 · 언제든 해지`
- 우측: 에디터 목업(`border-radius: 16px`, `box-shadow: 0 24px 60px rgba(0,0,0,.07)`). **실제 화면 캡처로 교체 필요.**

**신뢰 스트립** — `height` auto, `padding: 20px`, 중앙 정렬, `gap: 34px`, `14.5px rgba(0,0,0,.4)`, 사이 점 `4×4 #E6E6EB`
- `말투 학습 2~3편` · `초안 평균 1분 48초` · `검수는 사람이, 발행도 사람이`

**대상 3카드** — h2 `34px/700`, `letter-spacing: -.035em`: `글은 써야 하는데, 쓸 시간이 없는 분들`. 카드 `border-radius: 14px`, `border: 1px solid #efeff0`, `padding: 24px`. h3 `18.5px/700`, p `14.5px/1.65`
- `1인 사장님 · 자영업` / `마케팅 대행사` / `블로그 인플루언서`

**"자동으로 올려 주는 도구가 아닙니다"** — `grid-template-columns: .9fr 1.1fr`, `gap: 52px`
- 좌측: eyebrow `13px/700 uppercase #5e56f0` `검수는 건너뛸 수 없습니다` + h2 + 본문 2단락(둘째 `15px rgba(0,0,0,.4)`)
- 우측: **`3a`의 검수 카드 실물**을 축소해 배치. 말이 아니라 화면으로 증명합니다.

**3단계** — `repeat(3, 1fr)`, `gap: 16px`. 각 항목: 미니 목업(`height: 170px`) + 번호 `13px/700 #5e56f0` + h3 `20px/700` + p `14.5px/1.65`
- `01 내 글로 말투를 학습` / `02 사진과 한 줄로 초안 생성` / `03 검수하고 복사해서 올리기`

**현장 = 모바일** — `1fr .8fr`. 좌측 텍스트 + 체크 3행(`Check` `16×16 #0F7B52`, `15px rgba(0,0,0,.7)`), 우측 `250px` 폰 목업(`border-radius: 28px`, `box-shadow: 0 20px 44px rgba(0,0,0,.12)`)

**쇼츠** — `1.1fr .9fr`. 우측 9:16 프레임 3개

**요금 스트립** — `repeat(4, 1fr)`, `gap: 14px`. 카드 `border-radius: 14px`, `padding: 22px`, **`position: relative` 필수**(배지가 `top: -11px`로 카드를 넘어감)
- 강조 카드만 `border: 1.5px solid #5e56f0`, `background: #fff`, `box-shadow: 0 8px 24px rgba(94,86,240,.12)`; 나머지 `border: 1px solid #efeff0`, `background: #f7f7f8`
- 배지 `height: 22px`, `border-radius: 6px`, `top: -11px`, `right: 18px`, `11px/700 #fff`. 스탠다드 `#5e56f0` `가장 많이 선택`, 프리미엄 `#7C6CF5` `성장 운영 추천`
- 금액 `27px/700`, `letter-spacing: -.035em` + 단위 `13px rgba(0,0,0,.4)`
- 회차 `13.5px/700 #5e56f0`, 단가 `12.5px rgba(0,0,0,.42)`
- CTA `height: 44px`, `border-radius: 10px`, `14px/600`
- 섹션 h2: `쓴 만큼만, 1회 660원` / p: `먼저 1편을 무료로 써보세요. 자동 과금은 없습니다.`

**FAQ** — `repeat(2, 1fr)`, `gap: 16px`. 카드 `border-radius: 14px`, `padding: 22px 24px`. h3 `16.5px/700`, p `14.5px/1.65`
- `자동으로 발행되나요?` / `네이버에서 저품질로 걸리지 않나요?` / `기존 글이 없으면 못 쓰나요?` / `해지하면 쓴 글은요?`

**마무리 CTA** — 중앙, h2 `36px/700`: `오늘 현장 사진, 아직 안 쓰셨죠` + p + CTA 2개

**푸터** — `padding: 24px 40px`, `13.5px rgba(0,0,0,.4)`

### 4b — 요금 페이지

**금액·회차는 사용자가 제공한 실제 요금표(`pricing-reference.png`) 그대로입니다.** 이전 `plans.ts`의 값(Free/Lite/Pro, 29,000/79,000)은 **폐기**되었습니다.

| 플랜 | 금액 | 회차 | 단가 | 배지 | 대상 |
|---|---|---|---|---|---|
| 라이트 | ₩0 / 월 | 월 1회 무료 체험 | 자동 과금 없음 | — | 먼저 결과를 보고 정하기 |
| 스탠다드 | ₩9,900 / 월 | 월 15회 생성 | 약 660원 | 가장 많이 선택 | 1인 사장님 · 한 가게 한 브랜드 |
| 프리미엄 | ₩19,800 / 월 | 월 30회 생성 | 약 660원 | 성장 운영 추천 | 성장 중인 매장 · 여러 채널 |
| 엔터프라이즈 | ₩39,500 / 월 | 월 60회 생성 | 약 658원 | — | 마케팅 대행사 · 팀 운영 |

공통 항목: **이미지 생성 포함**, **SEO-GEO 최적화**, **대기업 블로그 스타일** (엔터프라이즈는 첨부 원본대로 SEO-GEO 줄이 없고, 대신 전용 지원 채널 / 주간 운영 리포트 / 우선순위 에이전트 배정).

**용어 규칙**: 단위는 **"편"이 아니라 "회 생성"**. 글 한 편을 만드는 것이 1회. `횟수`(o) / `회수`(x).

**레이아웃.**
- 헤더 `padding: 56px 40px 44px`, 중앙: h2 `38px/700`, `letter-spacing: -.04em` `생성 1회에 660원` + p `16.5px/1.7`, `max-width: 540px` `글 한 편을 만드는 것이 '1회'입니다. 이미지 생성은 모든 요금제에 포함됩니다.`
- **연/월 토글은 두지 않습니다.** 대신 신뢰 배너: `border-radius: 9999px`, `background: #f7f7f8`, `border: 1px solid #efeff0`, `padding: 9px 16px`. `Check` `15×15 #0F7B52` + `14px/600 rgba(0,0,0,.7)` `1회 무료 체험 후 자동 과금 없음 — 직접 결제하실 때만 시작됩니다`
- 카드 그리드 `max-width: 1120px`, `repeat(4, 1fr)`, `gap: 15px`, `align-items: start`
  - 카드 `border-radius: 16px`, `background: #fff`, `padding: 28px`, `gap: 18px`, **`position: relative`**
  - 강조(스탠다드) `border: 1.5px solid #5e56f0`, `box-shadow: 0 12px 32px rgba(94,86,240,.14)`
  - 배지 `left: 28px`, `top: -12px`, `height: 24px`, `border-radius: 7px`, `11.5px/700 #fff`
  - 플랜명 `17px/700`(강조는 `#5e56f0`), 대상 `14px/1.5 rgba(0,0,0,.5)`
  - 금액 `38px/700`, `letter-spacing: -.04em` + `15px rgba(0,0,0,.4)`
  - 회차 `13.5px/700 #5e56f0`, 단가 `12.5px rgba(0,0,0,.42)`
  - CTA `height: 48px`, `border-radius: 11px`, `15px/600`
  - 기능 행: `Check` `15×15 #0F7B52`(`margin-top: 2px`) + `14.5px/1.55 rgba(0,0,0,.7)`. 부연은 `<br>` + `13px rgba(0,0,0,.42)`
- 문의 스트립: `한도가 더 필요하거나…` → `월 60회로도 부족하거나, 세금계산서가 필요하신가요?` / `계정 공유 · 담당자별 권한 · 횟수 추가 구매를 따로 맞춰 드립니다.`
- 요금 FAQ 4개: 1회 집계 방식 / 회차 이월 / 플랜 변경 / 환불

⚠️ **정책 확정 필요 (모두 디자이너 가정값)**
- `생성을 실행하면 1회 집계, 문단 다시 쓰기는 횟수 미포함`
- `회차 이월 없음, 매달 초기화`
- `업그레이드 즉시 / 다운그레이드 다음 결제일`
- `결제 후 7일 내 미생성 시 전액 환불`

---

### 5a — 새 글 (모드 선택 단계 제거)

**바뀐 것.** 현재 `모드 선택 → 입력 → 생성` 3단계 중 첫 단계를 없앱니다. `post-modes.ts`의 worklog/topic/product는 **입력에서 추정**하고, 결과를 밝히되 바꿀 수 있게 합니다.

- `grid-template-columns: 1fr 312px`
- 좌측 `max-width: 640px`, `padding: 26px 28px`, `gap: 18px`
  - **추정 결과 칩**: `height: 22px`, `border-radius: 6px`, `background: #EFEDFF`, `10.5px/700 #4B3BFF`, `Sparkles` `12×12`: `시공 · 후기로 판단했습니다` + 옆에 `바꾸기` `11.5px/600 #8A8A94`
  - 입력 카드 `border-radius: 14px`, `border: 1.5px solid #4B3BFF`, `box-shadow: 0 2px 8px rgba(75,59,255,.1)`, `padding: 16px`. 입력 `17px/500`, 말투 칩 `height: 32px`
  - 사진 그리드 `repeat(6, 1fr)`, `gap: 8px`, `aspect-ratio: 1`, `border-radius: 10px`. 순번 배지 `19×19`, `border-radius: 6px`, `rgba(22,22,26,.7)`, `10px/700 #fff`
  - 캡션 자동 토글: `background: #FBFBFC`, `border: 1px solid #F0F0F3`, `padding: 11px 13px`. 스위치 `32×18`, `border-radius: 9999px`, on `#4B3BFF`, 노브 `14×14 #fff` `right: 2px`
  - **길이 3카드** (`topic-length.ts`) `repeat(3, 1fr)`, `gap: 9px`, `border-radius: 12px`, `padding: 13px 14px`
    - 선택: `border: 1.5px solid #4B3BFF`, `background: #F7F6FF`, 제목 `13.5px/700 #4B3BFF`, 설명 `11.5px #6B5FD6`
    - 미선택: `border: 1px solid #E8E8EC`, 제목 `13.5px/600`, 설명 `11.5px #9C9CA6`
    - `짧게` 약 800~1,200자 · 핵심만 / `보통` 약 1,500~2,200자 / `길게` 약 2,500~3,500자 · 자세히
  - **세부 설정 접기**: `border-top: 1px solid #F0F0F3`, `padding-top: 14px`. `12.5px/600 #8A8A94` `세부 설정 — 캡션 톤 · 섹션 수 · AI 이미지` + `ChevronRight` `16×16` + 우측 `11.5px #B4B4BE` `기본값으로 두면 됩니다`
- 우측 패널 `width: 312px`, `background: #fff`, `border-left: 1px solid #E8E8EC`, `padding: 22px 20px`, `gap: 16px`
  - **"이렇게 만들어집니다"** 요약 행: 라벨 `12.5px #6B6B75` / 값 `12.5px/600` 우측 정렬. 형식 / 말투 / 분량 / 사진 / 예상 시간
  - **한도 카드** `border-radius: 12px`, `background: #FBFBFC`. 바 `height: 5px`. 각주 `11.5px/1.5 #9C9CA6`
  - **초안 2종 비교 카드** `border: 1px solid #D9D4FF`, `background: #F7F6FF`. 라벨 `12px/700 #4B3BFF`. 설명: `서로 다른 두 초안을 만들어 마음에 드는 쪽을 고릅니다. 생성 2회로 집계됩니다.`
  - 하단(`margin-top: auto`) CTA `height: 50px`, `border-radius: 12px`, `background: #4B3BFF`, `15px/600 #fff` `초안 만들기` + 각주 `만드는 동안 다른 작업을 하셔도 됩니다`

### 5b — 내 글 (표 + 보드 전환)

- 헤더 `height: 52px`: 제목 + 개수 + 우측 **뷰 전환 세그먼트**(`border-radius: 9px`, `background: #F0F0F3`, `padding: 3px`; 항목 `height: 26px`, `border-radius: 7px`; 활성 `background: #fff`, `box-shadow: 0 1px 2px rgba(0,0,0,.07)`, `11.5px/600`) + `새 글` CTA
  - **보드 뷰 = `1c`의 4열 칸반**(준비 중 / 초안 / 검수 / 올림 완료)을 그대로 이 탭에 넣습니다.
- 필터 바 `height: 54px`, `background: #fff`, `border-bottom: 1px solid #E8E8EC`, `padding: 0 20px`, `gap: 9px` — **한 줄로 통합**(현재는 두 줄)
  - 상태 세그먼트: `border-radius: 9px`, `background: #FBFBFC`, `border: 1px solid #F0F0F3`, `padding: 3px`. 활성 `background: #16161A`/`#fff`. 라벨에 카운트 포함: `전체 38` `준비 중 11` `초안 14` `올림 완료 8` `보관 5`
  - 말투 드롭다운 / 검색(`width: 240px`, `background: #FAFAFA`, `Search` `14×14`) / 정렬
- 표 `border-radius: 12px`, `border: 1px solid #E8E8EC`, `background: #fff`
  - `grid-template-columns: 34px 1fr 116px 96px 96px 76px 40px`
  - 헤더 행 `height: 36px`, `background: #FBFBFC`, `10.5px/700`, `letter-spacing: .03em`, `#9C9CA6`
  - 데이터 행 `height: 58px` (현재 47px에서 확대), `border-bottom: 1px solid #F4F4F6`, `padding: 0 14px`
  - 체크박스 `15×15`, `border-radius: 4px`. 미선택 `border: 1.5px solid #D4D4DB`; 선택 `background: #4B3BFF` + `Check` `11×11 #fff`. 선택 행 `background: #F7F6FF`
  - **썸네일 `38×38`, `border-radius: 8px`** ← 신규
  - 제목 `13px/600` 1줄 ellipsis, 메타 `11px #9C9CA6 tabular-nums`
  - 말투: 컬러 도트 `7×7` + `11.5px #6B6B75`. 도트 색 — 말투별 고정 팔레트(`#4B3BFF`, `#0F7B52`, `#8A6410` …)
  - 상태 배지 `height: 20px`, `border-radius: 5px`, `10.5px/700`
  - **검수 컬럼** ← 신규: 점수 배지(≥90 `#E7F5EF`/`#0F7B52`, 90 미만 `#F4EDD8`/`#8A6410`) + 확인 건수 배지. 없으면 `—` `#C2C2CC`
  - 행 액션 `···` `#C2C2CC`
- **선택 시 플로팅 바**: `position: absolute`, `left: 50%`, `bottom: 24px`, `transform: translateX(-50%)`, `border-radius: 13px`, `background: #16161A`, `box-shadow: 0 12px 30px rgba(22,22,26,.32)`, `padding: 11px 14px 11px 18px`
  - `{n}개 선택됨` `13px/600 #fff` + 구분선 `1×20 #3A3A44` + 액션 `height: 34px`, `border-radius: 9px`, `background: #2A2A34`, `12.5px/600`: `말투 바꾸기` / `보관` / `삭제`(`#F0A9A2`) + 닫기

### 5c — 말투 학습

**용어.** 화면 전체에서 "테마"를 **"말투"**로 부릅니다. 라우트도 `/brands/*` → `/voices/*` 권장.

- 헤더 `height: 52px`: `ChevronLeft` + 이름 `15px/700` + 버전 배지(`#EFEDFF`/`#4B3BFF` `v3 학습됨`) + 메타 `11.5px #B4B4BE` `원문 {n}편 · {d} 갱신` + 우측 `이 말투로 새 글`(보조) / `다시 학습`(주, `Sparkles` `14×14`)
- `grid-template-columns: 1fr 372px`
- **좌측**
  - **예시 카드** `border-radius: 13px`, `border: 1px solid #E8E8EC`, `background: #fff`, `padding: 18px 20px`
    - 제목 `13.5px/700` `이 말투로 쓰면 이렇게 나옵니다` + 우측 `11.5px #B4B4BE` `원문 {n}편에서 학습`
    - 본문 `15px/1.75 #3f3f46` — 실제 생성 결과
    - 특징 칩 `height: 26px`, `border-radius: 7px`, `background: #F0F0F3`, `11.5px/600 #6B6B75`
  - **원문 목록 카드**
    - 헤더 `height: 46px`: `학습에 쓴 원문` + 카운트 + 우측 `원문 추가`(`background: #16161A`, `height: 30px`)
    - **일괄 가져오기 배너**(강조 위치): `background: #F7F6FF`, `border-bottom: 1px solid #F0F0F3`, `padding: 13px 16px`. `Sparkles` `17×17 #4B3BFF` + `12.5px/600 #4B3BFF` `블로그 주소만 넣으면 최대 100편을 한번에 가져옵니다` + `11.5px #6B5FD6` `한 편씩 붙여넣지 않아도 됩니다.` + CTA `주소로 가져오기`(`background: #4B3BFF`, `height: 30px`)
    - 행 `padding: 12px 16px`, `border-bottom: 1px solid #F4F4F6`. 제목 `12.5px/600` 1줄, 메타 `11px #9C9CA6 tabular-nums` `{출처} · {글자수}자 · {날짜}`
    - Ditodio에서 올린 글은 우측에 `자동 반영` 배지(`#E7F5EF`/`#0F7B52`)
- **우측 패널 — "배운 것 중에 끌 것"** (이 화면의 핵심)
  - 헤더 `13.5px/700` + 설명 `11.5px/1.5 #9C9CA6` `끄면 다음 글부터 그 특징을 쓰지 않습니다. 다시 켜도 학습을 새로 돌리지 않습니다.`
  - 항목 `border-radius: 11px`, `border: 1px solid #E8E8EC`, `padding: 12px 13px`, `gap: 11px`
    - 켜짐: `background: #fff`, 제목 `13px/600`, 설명 `11.5px/1.5 #9C9CA6`, 스위치 `34×20` on `#4B3BFF`, 노브 `16×16` `right: 2px`
    - 꺼짐: `background: #FBFBFC`, 제목 `#8A8A94`, 설명 `#B4B4BE`, 스위치 `#E0E0E6`, 노브 `left: 2px`
  - **`style-rules.ts`의 `STYLE_RULE_KEYS` 6개를 각각 토글로 노출합니다**: 자주 쓰는 표현 / 군더더기 표현 회피 / 마무리 CTA 문구 / 이모지 사용 / 강조색 사용 / 글자 크기 강조
    - 각 항목 설명에는 **실제 추출된 값**을 보여줍니다 (예: `그래서 오늘은 · 마무리하겠습니다 · 참고하세요`, `15px, 18px, 22px`)
  - 하단(`margin-top: auto`) 일치도 카드: `background: #FBFBFC`, `border: 1px solid #F0F0F3`, `padding: 13px`. `12px/700` `말투 일치도 {n}점` + `11.5px/1.55 #9C9CA6` `이 말투로 쓴 최근 {n}편 평균입니다. 원문을 더 넣으면 올라갑니다.`

---

## Interactions & Behavior

**전역**
- transition: `140ms ease` (hover), `200ms ease` (패널/시트 진입)
- 카드 hover: `border-color: #D4D4DB`, `box-shadow: 0 2px 8px rgba(22,22,26,.06)`
- 주 버튼 hover: `background`를 12% 어둡게 (`#4B3BFF` → `#3B2CE0`)
- 포커스 링: `box-shadow: 0 0 0 3px rgba(75,59,255,.25)`
- 숫자에는 항상 `font-variant-numeric: tabular-nums`

**생성 플로우**
1. 홈/위저드에서 제출 → 낙관적으로 목록에 "생성 중" 행 추가
2. 모드 추정 결과를 칩으로 노출, 클릭 시 수동 변경 가능
3. 진행 단계 스트리밍(`2b`③의 4단계) — 서버에서 단계 이벤트를 내려야 합니다
4. 첫 문단이 나오는 즉시 화면에 흘림(대기 이탈 방지의 핵심)
5. 완료 → 에디터로 이동, 검수 항목 자동 계산

**발행 플로우**
1. `올리러 가기` → 클립보드 쓰기(제스처 내) → 시트 오픈(이미 복사 완료 상태)
2. 플랫폼 선택 → 새 탭/딥링크로 글쓰기 화면
3. URL 입력(선택) → `올림 완료로 기록` → 말투 재학습 큐에 등록
4. URL 없이 기록도 허용

**반응형**
- ≥1280px: 3컬럼 전체
- 1024~1279px: 에디터 우측 패널을 오버레이 드로어로
- <1024px: `2b`의 모바일 화면으로 전환. 데스크톱 레이아웃을 축소하지 마십시오.

## State Management

```ts
// 홈
{ topic, selectedVoiceId, photos, inferredMode, continueItems, usage, unlearnedVoices }
// 온보딩
{ step: 1|2|3, voiceName, sources: Source[], extractedRules: StyleRule[], sampleSentence }
// 생성
{ jobId, stage: 'reading'|'captioning'|'writing'|'titling'|'done', elapsed, firstParagraph }
// 에디터
{ post, autoSaveState: 'idle'|'saving'|'saved', reviewItems: ReviewItem[], scores: {voice, seo},
  activePanel: 'review'|'photos'|'rewrite', focusedReviewId }
// 발행
{ open, platform, clipboardWritten, publishedUrl }
// 목록
{ view: 'table'|'board', statusFilter, voiceFilter, query, sort, selectedIds: string[] }
// 말투
{ voice, sources, rules: Record<StyleRuleKey, boolean>, matchScore }
```

## Design Tokens

**앱 화면 (`1b`, `2a`, `2b`, `3a`, `3b`, `5a`, `5b`, `5c`) — `globals.css`의 기존 값**

| 용도 | 값 |
|---|---|
| 배경 | `#F3F3F5` (본 제안은 `#F6F6F8`로 살짝 밝게) |
| 서피스 | `#FFFFFF` / `#FBFBFC` |
| 보더 | `#E8E8EC` (강) · `#F0F0F3` (약) · `#F4F4F6` (표 구분선) · `#E0E0E6` (버튼) · `#D4D4DB` (dashed) |
| 잉크 | `#16161A` (본문 강) · `#27272a` / `#3f3f46` (글 본문) · `#3A3A44` · `#6B6B75` · `#8A8A94` · `#9C9CA6` · `#B4B4BE` · `#C2C2CC` |
| accent | `#4B3BFF` · hover `#3B2CE0` · 배경 `#EFEDFF` · 보더 `#D9D4FF` · 밝은면 `#F7F6FF` · 잉크 `#6B5FD6` |
| 성공 | `#0F7B52` / 배경 `#E7F5EF` |
| 주의 | `#8A6410` / 배경 `#F4EDD8` · `#FDF9EE` / 보더 `#F0DFB4` · `#E0D3AC` / 하이라이트 `#FCF3DA` / 도트 `#E0A93C` / 진한 잉크 `#6B4E10` |
| 위험 | `#C2453C` / 배경 `#F7E7E5` / 다크 위 `#F0A9A2` |
| 중립 배지 | `#F0F0F3` / `#EDEDF1` (트랙) / `#E6E6EB` (이미지 자리) |
| 다크(생성 중) | 배경 `#16161A` · 서피스 `#1a1a21` · 보더 `#26262f` / `#332c52` · 잉크 `#fff` / `#f2f2f5` / `#c9c9d2` / `#8b8b98` / `#63636f` · accent `#8b7cff` |
| 다크(사이드 카드) | 배경 `#16161A` · 잉크 `#fff` / `#9C9CA6` · 서피스 `#2A2A34` / 보더 `#3A3A44` |

**랜딩·요금 (`4a`, `4b`) — `marketing.css` 계열**

| 용도 | 값 |
|---|---|
| accent | `#5e56f0` · 보조 배지 `#7C6CF5` |
| 배경 / 서피스 | `#f7f7f8` / `#fff` |
| 보더 | `#efeff0` |
| 잉크 | `rgba(0,0,0,.85)` / `.8` / `.75` / `.7` / `.6` / `.55` / `.5` / `.42` / `.4` / `.35` |

**Radius** — `4` `5` `6` `7` `8` `9` `10` `11` `12` `13` `14` `15` `16` `18` `20` `28` `40` `9999px`
- 배지 `5~7` / 버튼·입력 `8~12` / 카드 `11~16` / 시트 `18` / 폰 프레임 `28`(랜딩 목업) · `40`(모바일 화면)

**Spacing** — `2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 18 20 22 24 26 28 32 34 38 40 44 46 48 52 56 62 66 72` (px)

**Typography** — `Inter` + `Noto Sans KR`, `-webkit-font-smoothing: antialiased`
| 역할 | 크기 / 굵기 / 자간 |
|---|---|
| 랜딩 h1 | `52px/700`, `-.04em`, `line-height 1.12` |
| 랜딩 h2 | `34~38px/700`, `-.035~-.04em` |
| 요금 금액 | `27~38px/700`, `-.035~-.04em` |
| 앱 지표 | `27~44px/700`, `-.035~-.04em` |
| 온보딩 h2 | `25px/700`, `-.025em` |
| 홈 h2 | `26px/700`, `-.025em` |
| 에디터 글 제목 | `26px/700`, `line-height 1.35`, `-.02em` |
| 섹션 제목 | `15~20px/700`, `-.015~-.02em` |
| 글 본문 | `15px`, `line-height 1.75` |
| 랜딩 본문 | `14.5~17px`, `line-height 1.65~1.7` |
| 카드 제목 | `12.5~14px/600` |
| 본문 소 | `11.5~13px` |
| 메타·각주 | `10.5~12px` |
| 배지 | `10~11.5px/700` |
| eyebrow | `11~14px/700`, `letter-spacing .04~.1em` |
| 다크 레이블 | `12px/700`, `letter-spacing .09em` |

**Shadow**
```
0 1px 2px rgba(0,0,0,.07)          세그먼트 활성
0 1px 3px rgba(0,0,0,.04)          에디터 종이
0 2px 6px rgba(75,59,255,.35)      주 버튼
0 2px 8px rgba(94,86,240,.34)      랜딩 주 버튼
0 2px 10px rgba(22,22,26,.05)      시작 카드
0 6px 18px rgba(75,59,255,.3)      모바일 주역 카드
0 8px 24px rgba(94,86,240,.12)     요금 강조(스트립)
0 12px 32px rgba(94,86,240,.14)    요금 강조(상세)
0 12px 30px rgba(22,22,26,.32)     플로팅 선택 바
0 20px 44px rgba(0,0,0,.12)        랜딩 폰 목업
0 24px 60px rgba(0,0,0,.07)        랜딩 에디터 목업
0 24px 60px rgba(22,22,26,.28)     발행 시트
```

## Assets

- **아이콘**: 전부 `lucide-react`. 프로토타입은 실제 path를 인라인 SVG로 넣었습니다. 사용 아이콘: `House` `Plus` `Palette` `FolderOpen` `Clapperboard` `Settings` `Sparkles` `Check` `ArrowRight` `Image` `Search` `Clock` `ChevronRight` `ChevronLeft` `X`. 기본 `stroke-width: 1.7~2`, 크기 `11~24px`.
- **폰트**: 이미 `next/font/google`로 `Inter`, `Noto_Sans_KR`, `Geist_Mono` 로딩 중. 추가 없음.
- **이미지**: 전부 회색 플레이스홀더입니다. 필요한 실물 —
  - 랜딩 히어로 에디터 캡처 (`3a` 실화면 권장)
  - 랜딩 3단계 미니 캡처 3장
  - 모바일 목업 스크린샷
  - 쇼츠 9:16 프레임 3장
  - 예시 포스트 사진 (욕실 시공 시퀀스 등)
- **`pricing-reference.png`**: 사용자가 제공한 실제 요금표 원본. 4a·4b의 숫자·배지·문구 근거입니다.

## Files

| 파일 | 내용 |
|---|---|
| `Ditodio 홈 시안.dc.html` | 11개 화면 전체 (캔버스, TURN 5 → TURN 1 순) |
| `support.js` | 프로토타입 런타임. **구현 대상 아님** — HTML을 브라우저에서 열기 위해서만 필요 |
| `pricing-reference.png` | 사용자 제공 실제 요금표 |

### 프로토타입에서 참고한 코드베이스 파일

`src/app/globals.css` · `src/components/ui/button.tsx` · `src/components/ui/badge.tsx` · `src/app/(app)/layout.tsx` · `src/components/studio/StudioShell.tsx` · `src/app/(app)/dashboard/page.tsx` · `src/components/studio/PostsTable.tsx` · `src/components/studio/PostWorkspaceStudioView.tsx` · `src/components/PostWizard.tsx` · `src/components/BrandWorkspace.tsx` · `src/components/marketing/HomePage.tsx` · `src/components/marketing/marketing.css` · `src/lib/plans.ts`(요금은 폐기, 구조만 참고) · `src/lib/post-modes.ts` · `src/lib/topic-length.ts` · `src/lib/style-rules.ts`

## 구현 전 확정해야 할 것

1. **용어 변경 승인** — `테마` → `말투`, `발행 표시` → `올림 완료로 기록`. 제안 전체가 이 용어를 전제로 합니다. DB 컬럼·API는 그대로 두고 UI 레이블만 바꾸는 것도 가능합니다.
2. **검수 항목 목록** — `3a`의 "사실 확인 필요", "금액 표기 → 광고 신고 위험"은 디자인 예시입니다. 실제 검수 규칙과 문구를 정해야 합니다.
3. **요금 정책 문구** — 회차 집계 기준, 이월, 플랜 변경 시점, 환불 조건 (위 4b의 ⚠️ 항목).
4. **랜딩 캡처 이미지** — 히어로·3단계·모바일.
5. **랜딩 테마** — 사용자가 제공한 요금표 원본은 다크 테마입니다. 현재 제안은 기존 `marketing.css`에 맞춰 라이트로 유지했습니다. 다크로 갈 경우 `4a`·`4b` 전체 색을 다시 정의해야 합니다.
