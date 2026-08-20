# Oracle Cloud Free Tier — 가입부터 배포까지

이 문서는 **계정 가입 → Always Free VM → Docker로 Ditodio(blog_writer) 올리기**까지 순서대로 안내합니다.

---

## 0. 준비물

- 이메일 주소
- **휴대폰 번호** (인증용)
- **신용카드** (본인 확인용 — Always Free만 쓰면 통상 청구되지 않음. 소액 승인 후 해제되는 경우 있음)
- SSH용 키 쌍 (Windows면 PowerShell에서 생성 가능)

```powershell
# Windows: 키가 없으면 생성
ssh-keygen -t ed25519 -C "oracle-free"
# 공개키 내용 복사 (인스턴스 만들 때 붙여넣기)
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

---

## 1. 오라클 클라우드 가입

1. 브라우저에서 열기: [https://www.oracle.com/cloud/free/](https://www.oracle.com/cloud/free/)
2. **Start for free** / **무료로 시작하기** 클릭
3. 국가/지역, 이름, 이메일 입력 후 이메일 인증
4. 비밀번호·회사/개인 정보 입력
5. **Home Region(홈 리전) 선택** ← 중요  
   - Always Free VM/DB는 **홈 리전에서만** 만들 수 있습니다.  
   - 나중에 바꿀 수 없으니, 지연·가용성을 보고 고르세요.  
   - 한국이면 보통 `Japan Central (Osaka)` / `Japan East (Tokyo)` / 기타 가용 리전 중 선택 (콘솔에 표시되는 목록 기준)
6. 주소·전화 인증
7. 카드 등록 (인증). **Pay As You Go로 업그레이드하지 않으면** Always Free 한도 안에서는 계속 무료로 쓰는 구조입니다.
8. 가입 완료 후 [Cloud Console](https://cloud.oracle.com) 로그인

### 가입 직후 추천

- **Billing → Budgets** 에서 예산 알림 `$1` 등으로 설정 (실수 과금 방지)
- 메일로 오는 “trial credit $300 / 30일”은 **체험 크레딧**이고, 기간이 끝나도 **Always Free 자원은 유지**됩니다.

### Always Free에서 쓸 만한 것 (요약)

| 항목 | 대략 한도 (변경될 수 있음) |
|------|---------------------------|
| Ampere A1 (ARM) | **합계 약 2 OCPU / 12GB RAM** (문서 기준, 2026년 하향된 한도) |
| AMD Micro | 작은 인스턴스 최대 2대 |
| 스토리지 | 부트+블록 합쳐 약 200GB대 |
| 아웃바운드 등 | 제한 있음 — 자세한 건 OCI Free Tier 문서 확인 |

> 용량이 “Out of capacity”면 리전/AD를 바꾸거나 시간대를 바꿔 재시도하세요. AMD Micro로 대체 가능합니다.

---

## 2. 네트워크(방화벽) 포트 열기

인스턴스 만들기 **전후** 모두 가능합니다. 없으면 밖에서 SSH/웹이 안 됩니다.

1. 콘솔 좌측 메뉴 **Networking → Virtual Cloud Networks**
2. 기본 VCN 클릭 → **Security Lists** → Default Security List
3. **Add Ingress Rules**

| Source CIDR | IP Protocol | Destination Port | 용도 |
|-------------|-------------|------------------|------|
| `0.0.0.0/0` | TCP | 22 | SSH |
| `0.0.0.0/0` | TCP | 3000 | 앱(임시) |
| (나중에) `0.0.0.0/0` | TCP | 80, 443 | HTTPS |

---

## 3. Always Free VM 만들기

1. **Compute → Instances → Create instance**
2. Name: `ditodio` 등
3. **Placement**: Home region / Availability Domain 기본값
4. **Image**: Canonical Ubuntu **22.04** (또는 24.04)
5. **Shape → Change shape**
   - **Ampere** 탭 → `VM.Standard.A1.Flex`
   - OCPU: **2**, Memory: **12 GB** (Always Free 한도 꽉 채우기)  
     또는 여유 없으면 1 OCPU / 6GB
   - 안 되면 **AMD** → `VM.Standard.E2.1.Micro` (스펙은 작음)
6. **Networking**
   - Public subnet
   - **Assign a public IPv4 address** 체크
7. **Add SSH keys** → 위에서 복사한 `.pub` 붙여넣기
8. Boot volume: 기본(약 47GB)면 충분
9. **Create** → 상태가 **Running** 될 때까지 대기
10. 인스턴스 상세에서 **Public IP** 복사

Windows에서 접속:

```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519 ubuntu@공인IP
```

> 이미지가 Oracle Linux면 사용자가 `opc`일 수 있습니다. Ubuntu면 보통 `ubuntu`.

---

## 4. VM에 Docker 설치

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

다시 SSH 접속 후:

```bash
docker --version
docker compose version
```

(선택) OS 방화벽도 연 경우:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw enable
```

---

## 5. 앱 코드 올리기

GitHub에 푸시되어 있다면:

```bash
git clone https://github.com/YOUR_ORG/blog_writer.git
cd blog_writer
```

로컬 Windows에서 직접 복사:

```powershell
scp -r C:\Users\stkim\Documents\Codex\blog_writer ubuntu@공인IP:~/blog_writer
```

---

## 6. 환경변수 & 실행

```bash
cd ~/blog_writer
cp .env.production.example .env.production
nano .env.production
```

채울 값 예:

- `NEXT_PUBLIC_APP_URL=http://공인IP:3000`
- `AUTH_URL=http://공인IP:3000`
- `AUTH_SECRET=` → `openssl rand -hex 32`
- `SECRETS_ENCRYPTION_KEY=` → `openssl rand -hex 32`
- `ADMIN_EMAILS=본인이메일`
- LLM / Vision API 키

DB 비밀번호:

```bash
export POSTGRES_PASSWORD='강한비밀번호'
docker compose up -d --build
docker compose logs -f app
```

브라우저: `http://공인IP:3000`

마이그레이션은 컨테이너 시작 시 자동(`prisma migrate deploy`)입니다.

---

## 7. (권장) 도메인 + HTTPS

1. 도메인 A레코드 → 공인 IP
2. Caddy 등 리버스 프록시
3. `.env.production`의 URL을 `https://...` 로 바꾼 뒤 `docker compose up -d --force-recreate app`

---

## 자주 하는 작업

```bash
docker compose logs -f app
git pull && docker compose up -d --build
docker compose exec db pg_dump -U blog blog_writer > backup.sql
```

## 막힐 때

| 증상 | 확인 |
|------|------|
| 가입/카드 거절 | 다른 카드, 해외결제 가능 여부, 고객지원 |
| Shape out of capacity | 다른 AD, 시간 바꿔 재시도, AMD Micro |
| SSH 거부 | Security List 22, 공개키, 사용자명 `ubuntu`/`opc` |
| 웹 안 열림 | Security List 3000, `ufw`, `docker compose ps` |
| Always Free 초과 종료 | Ampere 합계 2 OCPU / 12GB 이하로 리사이즈 |

공식 문서: [OCI Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)

또는 로컬에서 scp/rsync:

```powershell
scp -r C:\Users\stkim\Documents\Codex\blog_writer ubuntu@YOUR_PUBLIC_IP:~/blog_writer
```

## 4. 환경변수

```bash
cp .env.production.example .env.production
nano .env.production
```

필수:

- `NEXT_PUBLIC_APP_URL` / `AUTH_URL` → `http://YOUR_PUBLIC_IP:3000` (도메인 있으면 https URL)
- `AUTH_SECRET` → `openssl rand -hex 32`
- `ADMIN_EMAILS`
- `SECRETS_ENCRYPTION_KEY` → `openssl rand -hex 32`
- LLM/Vision 키
- `POSTGRES_PASSWORD`는 compose와 맞추려면 shell에서:

```bash
export POSTGRES_PASSWORD='(강한비밀번호)'
# .env.production 과 docker-compose 모두 동일 값 사용
```

`docker-compose.yml`은 `POSTGRES_PASSWORD` 환경변수를 DB와 `DATABASE_URL`에 씁니다.

## 5. 빌드 & 실행

```bash
export POSTGRES_PASSWORD='(강한비밀번호)'
docker compose up -d --build
docker compose logs -f app
```

브라우저: `http://YOUR_PUBLIC_IP:3000`

마이그레이션은 컨테이너 시작 시 `prisma migrate deploy`로 자동 실행됩니다.

## 6. (권장) 도메인 + HTTPS

1. 도메인 A레코드를 Public IP로 연결
2. Caddy 또는 Nginx + Let's Encrypt

예시 (Caddy):

```bash
sudo apt-get install -y caddy
```

`/etc/caddy/Caddyfile`:

```
app.yourdomain.com {
  reverse_proxy localhost:3000
}
```

`.env.production`의 `NEXT_PUBLIC_APP_URL`, `AUTH_URL`을 `https://app.yourdomain.com`으로 바꾼 뒤:

```bash
docker compose up -d --force-recreate app
```

## 7. 자주 하는 작업

```bash
# 로그
docker compose logs -f app

# 재배포 (코드 pull 후)
git pull
docker compose up -d --build

# DB 백업
docker compose exec db pg_dump -U blog blog_writer > backup.sql
```

## 주의

- Free Tier **Always Free** 한도(Ampere 합계 4 OCPU / 24GB)를 넘기지 마세요.
- 이미지를 S3 없이 `public/uploads`에 두면 VM 디스크에만 남습니다. 가능하면 Object Storage(S3 호환) 연결을 권장합니다.
- 방화벽: OCI Security List **와** `ufw` 둘 다 열어야 할 수 있습니다 (`sudo ufw allow 3000/tcp`).
