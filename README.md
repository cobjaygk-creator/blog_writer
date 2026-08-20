# Ditodio (blog_writer hub)

Ditodio 통합 제품군의 **컨트롤 플레인** — 계정 · 요금제 · 관리자 · 블로그(포스트) 앱.

블로그 포스트와 New Cut 쇼츠는 시스템이 달라도 **ditodio.com 계정·통합 요금제**로 함께 씁니다.
쇼츠 앱은 이 허브의 `/api/platform/*` 로 한도·사용량을 조회/차감합니다.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
- Auth.js / NextAuth (Credentials) — 프로덕션에서 `.ditodio.com` 쿠키 공유 가능
- S3 호환 스토리지 · LLM/Vision (OpenAI-compatible HTTP)
- Toss 빌링 · 관리자 콘솔 (`/admin`)

## Features

1. 회원가입 / 로그인 / 세션 (Ditodio 단일 계정)
2. 테마 CRUD · 원문 · 스타일 학습
3. 포스트 생성 · 사진 · 비전 캡션 · 초안 생성
4. Ditodio 통합 요금제 (포스트 N/월 + 쇼츠 N/월)
5. 관리자: 회원 · 요금제 · 결제 · 사용량(미터) · 연동 키
6. New Cut 딥링크 + handoff JWT (`/api/platform/handoff`)

### Domain layout (production)

| Host | Role |
|------|------|
| `ditodio.com` | 랜딩 · 가입 · 요금 |
| `app.ditodio.com` | 이 앱 (포스트) |
| `shorts.ditodio.com` | New Cut |
| `/admin` | Ditodio 공용 관리자 |

Set `AUTH_COOKIE_DOMAIN=.ditodio.com` for cross-subdomain SSO.

### Platform API (New Cut)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/platform/me` | session / handoff / service token |
| GET | `/api/platform/entitlements` | same |
| POST | `/api/platform/usage` | `{ meter: "shorts"\|"posts"\|"generates", delta? }` |
| POST | `/api/platform/handoff` | session → short-lived JWT |

Service auth: `PLATFORM_SERVICE_TOKEN` + `X-User-Id` (or `Authorization: Bearer …`).

### New Cut deep link

| 항목 | 값 |
|------|-----|
| Local base | `http://127.0.0.1:5173` (`NEXT_PUBLIC_NEW_CUT_URL`) |
| Target | `#/studio/create` |
| Query | `from=ditodio`, `source=blog`, optional `brandId`, `postId`, `handoff` |

### Ditodio plan seeds

| Plan | 월 요금 | 포스트/월 | 쇼츠/월 | 테마 |
|------|---------|-----------|---------|------|
| free | 0 | 15 | 3 | 1 |
| lite | 29,000 | 60 | 20 | 5 |
| pro | 79,000 | 200 | 80 | 30 |

한도는 관리자 요금제 화면에서 조정합니다.

## Deploy (Oracle Cloud Free Tier)

Docker Compose로 Always Free VM에 올리는 가이드:

→ [`deploy/oracle-free.md`](deploy/oracle-free.md)

```bash
cp .env.production.example .env.production
# 값 채운 뒤
docker compose up -d --build
```

## Setup

1. PostgreSQL 준비 후 DB 생성  
   `createdb blog_writer` (또는 Docker 등)

2. 환경변수

```powershell
cd C:\Users\stkim\Documents\Codex\blog_writer
Copy-Item .env.example .env
# DATABASE_URL, AUTH_SECRET, ADMIN_EMAILS, SECRETS_ENCRYPTION_KEY 등 설정
```

3. 마이그레이션 & 개발 서버

```powershell
npm.cmd install
npx.cmd prisma migrate deploy
npm.cmd run dev
```

- App: http://localhost:3000  
- Admin: http://localhost:3000/admin  
- Health: http://localhost:3000/api/health

## Scripts

| Script | 설명 |
|--------|------|
| `npm run dev` | Next 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run db:migrate` | Prisma migrate |
| `npm run db:studio` | Prisma Studio |
