# 구글 OAuth 로그인 설정 가이드

> 코드는 구현 완료(apps/admin). 아래는 **사람이 직접 해야 하는 설정**과 동작 방식 정리.

## 동작 방식 (멀티테넌시 연동)

- 구글은 **로그인 간소화용 인증 수단**(비밀번호 대신). 회원가입 정보(워크스페이스)는 별도 단계에서 생성.
- **로그인 흐름(`flow=login`)** — 기존 워크스페이스 멤버만 통과(**초대제**). 멤버 아닌 새 구글 계정은 콜백에서 로그아웃 + 차단 안내.
- **회원가입 흐름(`flow=signup`)** — `/signup`에서 "Google로 시작하기" → 인증 후 워크스페이스 없으면 `/onboarding`으로 보내 회사명·slug 입력 → 새 워크스페이스+owner 생성.

```
/login   ──"Google로 로그인"──▶ 구글 동의 ──▶ /auth/callback?flow=login
/signup  ──"Google로 시작하기"─▶ 구글 동의 ──▶ /auth/callback?flow=signup

/auth/callback:
  exchangeCodeForSession
  └─ 멤버십 있음 ────────────▶ /products
  └─ 없음 + flow=signup ─────▶ /onboarding ─(회사명 입력)─▶ 워크스페이스 생성 ─▶ /products
  └─ 없음 + flow=login ──────▶ 로그아웃 + /login?error=초대받지않은계정
```

## 코드 (구현 완료)

| 파일 | 역할 |
|------|------|
| `actions/auth.ts` `signInWithGoogle(flow)` | OAuth 시작, `/auth/callback?flow=` 로 redirect |
| `app/auth/callback/route.ts` | 세션교환 + 멤버십 분기 |
| `actions/workspaces.ts` `createWorkspaceForCurrentUser()` | 온보딩: 현재 유저로 워크스페이스+owner+모듈 생성 |
| `app/(auth)/login/page.tsx` | "Google로 로그인" 버튼 + 에러표시 |
| `app/(auth)/signup/page.tsx` | "Google로 시작하기" 버튼 |
| `app/(auth)/onboarding/page.tsx` | 회사명·slug 입력 폼 |

## ⚙️ 사람이 할 설정 (코드 아님)

### 1. Google Cloud Console
1. https://console.cloud.google.com → 프로젝트 생성/선택
2. "API 및 서비스" → "OAuth 동의 화면" 구성 (외부, 앱 이름, 지원 이메일)
3. "사용자 인증 정보" → "OAuth 2.0 클라이언트 ID" 생성 (유형: 웹 애플리케이션)
4. **승인된 리디렉션 URI**에 추가:
   ```
   https://hvkbqlwfwghooggrkyfb.supabase.co/auth/v1/callback
   ```
5. 발급된 **클라이언트 ID**와 **클라이언트 보안 비밀** 복사

### 2. Supabase 대시보드
1. 프로젝트 → Authentication → Providers → **Google** 활성화
2. 위에서 복사한 Client ID / Client Secret 붙여넣기 → 저장
3. Authentication → URL Configuration → **Redirect URLs**에 앱 콜백 추가:
   ```
   http://localhost:3001/auth/callback      (개발)
   https://<운영도메인>/auth/callback         (배포 후)
   ```

### 3. 환경변수 (.env.local)
- `NEXT_PUBLIC_APP_URL` — redirectTo 생성에 사용 (예: `http://localhost:3001`, 배포 시 운영 도메인)

## 남은 작업

- [ ] **apps/b2b-portal** — 현재 **매직링크(이메일)** 로그인 + `ensureCompany`/`/setup` 온보딩 사용. 콜백도 hash 기반(page.tsx)이라 admin과 패턴이 다름. 구글 추가 시 b2b-portal 흐름에 맞춰 별도 구현 필요.
- [ ] 신규 워크스페이스 owner의 RBAC 시드 — 온보딩 직후 부서/직급/메뉴권한이 비어 있어 (admin)layout 권한판정이 빈약. director 역할 자동 부여 또는 기본 RBAC 시드 검토.
