# Railway로 Ditodio(blog_writer) 배포

Oracle VM보다 훨씬 짧습니다. **GitHub 연결 → Postgres → 환경변수 → Deploy**.

---

## 0. 준비

1. 이 저장소의 `Dockerfile`, `deploy/docker-entrypoint.sh`, `railway.toml` 이 **GitHub `master`에 푸시**되어 있어야 합니다.
2. [railway.app](https://railway.app) 에서 GitHub으로 가입/로그인
3. 로컬 `.env`에 있는 API 키들을 메모 (LLM, Vision 등)

---

## 1. 프로젝트 만들기

1. Railway 대시보드 → **New Project**
2. **Deploy from GitHub repo** → `blog_writer` 선택 (권한 요청 시 Allow)
3. 브랜치: `master`
4. Railway가 `Dockerfile`을 감지하면 Docker 빌드로 진행됩니다.  
   (`railway.toml`에 `DOCKERFILE`로 고정해 둠)

빌드가 처음엔 **환경변수/DB 없어서** 실패해도 괜찮습니다. 아래를 먼저 채운 뒤 **Redeploy**.

---

## 2. PostgreSQL 추가

1. 프로젝트에서 **+ New** → **Database** → **PostgreSQL**
2. 앱 서비스(GitHub에서 배포된 서비스) 클릭 → **Variables** → **Add Variable** → **Add Reference**
3. Postgres의 `DATABASE_URL`을 앱에 연결  
   - 변수 이름: `DATABASE_URL`  
   - 값: Postgres 플러그인의 `DATABASE_URL` 참조

컨테이너 시작 시 `deploy/docker-entrypoint.sh`가  
`prisma migrate deploy`를 자동 실행합니다.

---

## 3. 필수 환경변수

앱 서비스 → **Variables**에 아래를 넣습니다.

배포 URL은 Railway가 준 공개 도메인으로 맞춥니다.  
예: `https://blog-writer-production-xxxx.up.railway.app`  
(서비스 → **Settings** → **Networking** → **Generate Domain**)

```env
NEXT_PUBLIC_APP_URL=https://YOUR-RAILWAY-DOMAIN
AUTH_URL=https://YOUR-RAILWAY-DOMAIN
AUTH_SECRET=긴랜덤문자열
NEXT_PUBLIC_STUDIO_UI=1
INTEGRATIONS_ALLOW_FALLBACK=true
ADMIN_EMAILS=당신@이메일.com
SECRETS_ENCRYPTION_KEY=64자hex

# 초안 생성용 (로컬 .env에서 복사)
LLM_API_KEY=
LLM_GPT_API_KEY=
LLM_GEMINI_API_KEY=
VISION_API_KEY=
```

`AUTH_SECRET` / `SECRETS_ENCRYPTION_KEY` 생성 (로컬 PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

두 번 실행해서 각각 다른 값을 쓰면 됩니다.

선택:

```env
UNSPLASH_ACCESS_KEY=
STORAGE_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_PUBLIC_BASE_URL=
```

S3를 안 쓰면 업로드는 컨테이너 디스크에 저장됩니다. **재배포 시 사라질 수 있음** (시연이면 보통 OK).

---

## 4. 도메인 열고 재배포

1. 앱 서비스 → **Settings** → **Networking** → **Generate Domain**
2. 위에서 만든 URL을 `NEXT_PUBLIC_APP_URL` / `AUTH_URL`에 반영
3. **Deploy** / **Redeploy**

성공하면 해당 URL로 접속 → 로그인/글 생성 시연.

---

## 5. 자주 막히는 곳

| 증상 | 확인 |
|------|------|
| 빌드 성공, 기동 직후 죽음 | `DATABASE_URL` 연결 여부, Deploy 로그의 `prisma migrate` |
| 로그인 이상 / CSRF | `AUTH_URL`·`NEXT_PUBLIC_APP_URL`이 **https 공개 도메인**과 일치하는지 |
| 초안 생성 실패 | `LLM_*` / `VISION_*` 키 |
| 사진 업로드 후 재배포에 사라짐 | S3 연동 또는 Railway Volume (`/app/public/uploads`) |

---

## 비용·정리

- Hobby/Trial 크레딧으로 시연 가능. 끝나면 프로젝트 **Delete** 하면 과금 중단.
- Oracle VM은 콘솔에서 **Stop** 해 두면 됩니다.
