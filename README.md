# blog_writer

AI 블로그 포스트 생성기 (New Cut 쇼츠와 **별도** 서비스).

업체(Brand)별 기존 글 문체를 학습하고, 사진 + 키워드로 블로그 초안을 만든 뒤  
네이버·티스토리에 복사/붙여넣기로 올리는 워크플로를 지원합니다.  
New Cut은 메뉴/딥링크로만 연결합니다 (`NEXT_PUBLIC_NEW_CUT_URL`).

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
- Auth.js / NextAuth (Credentials)
- S3 호환 스토리지 · LLM/Vision (OpenAI-compatible HTTP)
- UI primitives (Button/Input/Card 등 shadcn 스타일)

## Features

1. 회원가입 / 로그인 / 세션
2. 업체 CRUD · 원문(SourcePost) · 스타일 학습(StyleProfile)
3. 포스트 생성 · 사진 업로드(S3 또는 로컬 `public/uploads`) · 비전 캡션 · 순서 변경
4. StyleProfile + 키워드 + 캡션으로 초안 생성 · 스마트 에디터 편집
5. 네이버/티스토리용 원클릭 복사(서식·이미지)
6. New Cut 딥링크 (`?from=blog_writer&source=blog#/studio/create`)

LLM/Vision/S3 키가 없어도 로컬 폴백으로 흐름을 확인할 수 있습니다.  
연동 상태: `GET /api/integrations/status`

### Integrations

| Env | 기본 | 설명 |
|-----|------|------|
| `INTEGRATIONS_ALLOW_FALLBACK` | `true` | `false`면 키 누락/API 실패 시 에러 (프로덕션 권장) |
| `LLM_TIMEOUT_MS` / `VISION_TIMEOUT_MS` / `STORAGE_TIMEOUT_MS` | 45s/45s/30s | 요청 타임아웃 |
| `LLM_MAX_TOKENS` / `VISION_MAX_TOKENS` | 2500/300 | 응답 토큰 상한 |
| `UPLOAD_MAX_BYTES` | 8MB | 업로드 크기 제한 |
| `UPLOAD_MAX_IMAGES_PER_POST` | 20 | 포스트당 이미지 수 제한 |

실연동 시 `.env`에 `LLM_API_KEY`(및 선택적으로 `VISION_*`, `STORAGE_*`)를 채우면 live 모드로 동작합니다.

### New Cut deep link

| 항목 | 값 |
|------|-----|
| Local base | `http://127.0.0.1:5173` (`NEXT_PUBLIC_NEW_CUT_URL`) |
| Target | `#/studio/create` (블로그 URL 탭) |
| Query | `from=blog_writer`, `source=blog`, optional `brandId`, `postId`, `url` |

예시: `http://127.0.0.1:5173/?from=blog_writer&source=blog&postId=…#/studio/create`

### Plan limits

| Plan | 업체 | 원문/업체 | 포스트/일 | 이미지/포스트 |
|------|------|-----------|-----------|---------------|
| free | 2 | 5 | 5 | 8 |
| lite | 10 | 20 | 30 | 20 |
| pro | 100 | 100 | 200 | 40 |

## Setup

1. PostgreSQL 준비 후 DB 생성  
   `createdb blog_writer` (또는 Docker 등)

2. 환경변수

```powershell
cd C:\Users\stkim\Documents\Codex\blog_writer
Copy-Item .env.example .env
# .env 에서 DATABASE_URL, AUTH_SECRET 수정
```

`AUTH_SECRET` 예시 생성:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. 마이그레이션 & 개발 서버

```powershell
npm.cmd install
npx.cmd prisma migrate dev --name init
npm.cmd run dev
```

- App: http://localhost:3000  
- Health: http://localhost:3000/api/health

## Scripts

| Script | 설명 |
|--------|------|
| `npm run dev` | Next 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run db:migrate` | Prisma migrate |
| `npm run db:studio` | Prisma Studio |

## Roadmap

1. ~~프로젝트 초기화 & DB & 인증~~  
2. ~~업체 + 원문 + 스타일 학습 API~~  
3. ~~사진 업로드 / 비전 캡션 / 순서~~  
4. ~~포스트 초안 생성 API~~  
5. ~~화면 고도화 (UI primitives, 편집기)~~  
6. ~~New Cut 메뉴 연결~~  
