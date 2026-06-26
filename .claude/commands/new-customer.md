# /new-customer — 새 고객 프로젝트 온보딩

새 고객을 위한 Supabase 프로젝트, Git 브랜치, 환경변수, 마스터 계정, Vercel 배포까지 전체 세팅을 진행합니다.

## 인자

- `$ARGUMENTS` — 고객 식별자 (예: `jungwook`, `techsol`). 없으면 사용자에게 질문.

## 실행 절차

### Step 1: 고객 정보 수집

사용자에게 아래 정보를 질문합니다:

1. **고객 식별자** (영문, 브랜치명/프로젝트명에 사용됨) — 인자로 받았으면 스킵
2. **고객 회사명** (한글, 마스터 계정 메모용)
3. **마스터 계정 이메일** (최초 어드민 로그인용)
4. **마스터 계정 비밀번호** (최소 6자)

### Step 2: Supabase 프로젝트 생성

MCP `create_project` 도구 사용:
- 프로젝트명: `erp-{고객식별자}`
- Region: `ap-northeast-1` (Seoul)
- DB 비밀번호: 자동 생성 후 사용자에게 알려줌

MCP가 연결되어 있지 않은 경우:
- 사용자에게 안내: "Supabase MCP가 연결되어 있지 않습니다. 아래 절차를 따라주세요:"
  1. Supabase 대시보드(https://app.supabase.com)에서 새 프로젝트 생성
  2. 프로젝트명: `erp-{고객식별자}`, Region: Seoul
  3. 생성 후 Settings > API에서 아래 3개 값을 알려달라고 요청:
     - Project URL (`https://xxxx.supabase.co`)
     - anon key
     - service_role key
- 사용자 응답을 기다린 후 계속 진행

### Step 3: 스키마 적용

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

- `PROJECT_REF`는 Project URL에서 추출: `https://<PROJECT_REF>.supabase.co`
- 실패 시 대안: `supabase/schema_dump.sql` 내용을 사용자에게 "대시보드 SQL Editor에 붙여넣어 실행해주세요" 안내

### Step 4: 마스터 계정 생성

Supabase SQL (MCP 또는 대시보드 SQL Editor):

```sql
-- 1. Auth 사용자 생성 (대시보드 Authentication > Users > Add User 안내)
-- 2. 권한 부여
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data ||
  '{"department":"경영","position":"이사"}'::jsonb
WHERE email = '<마스터_이메일>';
```

- MCP가 있으면 자동 실행
- 없으면 사용자에게 SQL 복사해서 대시보드에서 실행하도록 안내
- 먼저 "대시보드 > Authentication > Users > Add User에서 이메일/비밀번호로 계정을 만드신 후 알려주세요" 안내

### Step 5: 고객 브랜치 생성

```bash
# 현재 변경사항 보호
git status
# 변경사항 있으면 git stash push -u -m "new-customer 전 임시 저장"

git checkout main
git pull origin main
git checkout -b customer/<고객식별자>
```

### Step 6: 환경변수 설정

`.env.{고객식별자}` 파일을 3개 앱에 생성합니다. 이 파일은 고객별 env 백업으로, 브랜치 전환 시 `.env.local`로 복사됩니다.

각 앱 디렉토리에 `.env.{고객식별자}` 생성:

**apps/admin/.env.{고객식별자}:**
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# pdf-lib 폰트 경로 (절대경로)
PDF_FONTS_DIR=<현재 작업 디렉토리>/apps/admin/lib/pdf/fonts

# 앱
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_B2B_PORTAL_URL=

# Resend (email-lib)
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_BRAND_NAME={고객 회사명} ERP
```

**apps/b2b-portal/.env.{고객식별자}:**
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# 앱
NEXT_PUBLIC_APP_URL=

# pdf-lib 폰트 경로 (절대경로)
PDF_FONTS_DIR=<현재 작업 디렉토리>/apps/admin/lib/pdf/fonts

# Resend (email-lib)
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_BRAND_NAME={고객 회사명} B2B 포털
```

**apps/logistics/.env.{고객식별자}:**
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# pdf-lib 폰트 경로 (절대경로)
PDF_FONTS_DIR=<현재 작업 디렉토리>/apps/admin/lib/pdf/fonts

# 앱
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_B2B_PORTAL_URL=

# Resend (email-lib)
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_BRAND_NAME={고객 회사명} 물류
```

생성 후 `.env.{고객식별자}` → `.env.local`로 복사하여 활성화:
```bash
cp apps/admin/.env.<고객식별자> apps/admin/.env.local
cp apps/b2b-portal/.env.<고객식별자> apps/b2b-portal/.env.local
cp apps/logistics/.env.<고객식별자> apps/logistics/.env.local
```

### Step 7: 의존성 설치 확인

```bash
npm install
```

### Step 8: Vercel 배포 안내

사용자에게 아래 내용을 안내합니다:

---

**Vercel 프로젝트를 생성해주세요:**

1. https://vercel.com/new 에 접속
2. GitHub 레포 `erp-admin-lib` (또는 해당 레포) 선택
3. 아래 설정으로 생성:
   - **Project Name:** `erp-{고객식별자}-admin`
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/admin`
   - **Branch:** `customer/{고객식별자}`
4. Environment Variables 추가:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<REF>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<anon_key>`
   - `SUPABASE_SERVICE_ROLE_KEY` = `<service_role_key>`
5. "Deploy" 클릭

완료되면 Vercel 프로젝트 URL을 알려주세요.

---

- b2b-portal, logistics도 필요하면 같은 방식으로 Vercel 프로젝트 추가 생성 안내
- 사용자가 URL을 돌려주면 `.env.{고객식별자}`와 `.env.local`의 `NEXT_PUBLIC_APP_URL`을 업데이트

### Step 9: 완료 보고

아래 내용을 정리하여 사용자에게 보여줌:

```
고객 온보딩 완료: {고객 회사명}

Supabase
  - 프로젝트: erp-{고객식별자}
  - URL: https://<REF>.supabase.co
  - 마스터 계정: <이메일>

Git
  - 브랜치: customer/{고객식별자}
  - env 파일: .env.{고객식별자} (3개 앱)

Vercel
  - URL: <Vercel URL 또는 "추후 설정">

다음 단계
  - 로고/디자인 커스텀 작업
  - /deploy-preview 로 배포
  - /sync-main 으로 공용 업데이트 동기화
  - /switch-customer 로 다른 고객 브랜치 전환
```

### Step 10: 가이드 문서 업데이트

`docs/guides/supabase-setup.md`의 프로젝트 목록 테이블에 새 고객 정보 추가:

```markdown
| {고객명} | `<PROJECT_REF>` | Seoul | {비고} |
```
