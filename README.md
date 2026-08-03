# blog_writer

AI 블로그 포스트 생성기 (New Cut 쇼츠와 **별도** 서비스).

업체(Brand)별 기존 글 문체를 학습하고, 사진 + 키워드로 블로그 초안을 만듭니다.  
이후 New Cut 메뉴/딥링크로만 연결할 예정입니다.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
- Auth.js / NextAuth (Credentials)
- S3 호환 스토리지 · LLM/Vision 키는 환경변수로 주입 (2단계 이후)

## Phase 1 (완료)

- Prisma 스키마: User, Brand, SourcePost, StyleProfile, Post, PostImage
- 회원가입 / 로그인 / 세션
- 랜딩, 대시보드 골격
- `.env.example`

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
2. 업체 + 원문 + 스타일 학습 API  
3. 사진 업로드 / 비전 캡션 / 순서  
4. 포스트 초안 생성 API  
5. 화면 고도화 (shadcn, 편집기)  
6. New Cut 메뉴 연결
