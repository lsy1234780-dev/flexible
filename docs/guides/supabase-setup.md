# Supabase 프로젝트 세팅 가이드

> 새 고객 프로젝트 생성, 스키마 복제, CLI 연동 절차를 다룹니다.

---

## 1. Supabase CLI 로그인 (최초 1회)

```bash
npx supabase login
```

- 브라우저에서 Supabase 계정 로그인
- 토큰이 로컬에 저장됨 (`~/.supabase/access-token`)
- 이후 `link`, `db dump`, `db push` 등 CLI 명령 사용 가능

---

## 2. 기존 프로젝트 연결 (link)

```bash
npx supabase link --project-ref <PROJECT_REF>
```

- `PROJECT_REF`는 Supabase URL에서 추출: `https://<PROJECT_REF>.supabase.co`
- DB 비밀번호 입력 필요 → 대시보드 > Settings > Database > Database password
- 현재 공용 베이스: `hevlupbynsuqdfhynamd`

---

## 3. 현재 DB 스키마 추출 (dump)

```bash
npx supabase db dump -f supabase/schema_dump.sql --schema public
```

- 프로덕션 DB의 최종 테이블/함수/인덱스/RLS를 하나의 SQL로 추출
- 새 고객 프로젝트에 스키마 복제할 때 기준 파일로 사용
- 데이터는 포함되지 않음 (스키마만)

---

## 4. 새 고객 프로젝트 생성 절차

### 4-1. Supabase 대시보드에서 프로젝트 생성

1. [app.supabase.com](https://app.supabase.com) 접속
2. Organization 선택 (기존 것 사용)
3. "New Project" 클릭
4. 프로젝트명: `erp-고객명` (예: `erp-jungwook`)
5. DB 비밀번호 설정 (안전한 곳에 보관)
6. Region: `Northeast Asia (Seoul)` 선택

### 4-2. 스키마 적용

```bash
# 새 프로젝트 연결
npx supabase link --project-ref <새_PROJECT_REF>

# 방법 A: 마이그레이션 순서대로 적용
npx supabase db push

# 방법 B: 통합 스키마 파일로 적용 (대시보드 SQL Editor에서)
# supabase/schema_dump.sql 내용을 복사하여 실행
```

### 4-3. 고객 브랜치 환경변수 설정

```bash
# 고객 브랜치에서
git checkout customer/고객명
```

각 앱의 `.env.local`에 새 프로젝트 키 입력:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<새_PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<새 anon key>
SUPABASE_SERVICE_ROLE_KEY=<새 service role key>
```

키 확인: 대시보드 > Settings > API

### 4-4. MCP 연결 (선택)

`.claude/settings.local.json`에 추가:

```json
{
  "mcpServers": {
    "supabase-고객명": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=<새_PROJECT_REF>"
    }
  }
}
```

---

## 5. 스키마 업데이트 (공용 → 고객)

main에 새 마이그레이션이 추가된 경우:

```bash
# 고객 브랜치에서
/sync-main              # main 변경사항 머지 (스킬)

# 새 마이그레이션만 적용
npx supabase link --project-ref <고객_PROJECT_REF>
npx supabase db push
```

---

## 6. 프로젝트별 정보 관리

| 고객 | PROJECT_REF | Region | 비고 |
|------|-------------|--------|------|
| 공용 베이스 | `hevlupbynsuqdfhynamd` | Seoul | 개발/데모용 |
| (고객 추가 시 여기에 기록) | | | |

> DB 비밀번호, service role key 등 민감 정보는 이 문서에 기록하지 마세요.
> 별도 비밀번호 관리 도구(1Password 등)를 사용하세요.
