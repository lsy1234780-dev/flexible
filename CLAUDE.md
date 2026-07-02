# CLAUDE.md — ERP 전산망 메인 프로젝트

> 이 파일은 Claude Code (AI Agent)가 본 프로젝트에서 작업할 때 반드시 먼저 읽어야 하는 문서입니다.
> 작업 시작 전 전체 내용을 숙지하고, 각 섹션의 규칙을 엄격히 따르세요.

---

## 프로젝트 목적

B2B 발주·물류·CRM 통합 ERP 전산망.
바코드 재고관리 → B2B 업체 포털 → 물류 자동화 → CRM 통합까지 4단계로 확장되는 시스템입니다.

---

## 모노레포 구조

```
erp-workspace/
├── apps/
│   ├── admin/          # 내부 어드민 (Next.js 16)
│   ├── b2b-portal/     # B2B 업체용 포털 (Next.js 16)
│   └── logistics/      # 물류팀 전용 화면 (Next.js 16, PWA)
│
└── packages/
    └── database/       # Supabase client + 자동생성 타입 (내부 전용)
```

> **ui는 앱별로 따로 구성합니다.** 사이트마다 디자인이 달라 공통화 이득이 없고, shadcn/ui는 각 앱에 직접 설치해서 사용하세요.
> **alert(LINE 등)는 앱 내부 `lib/alert.ts`로 구현합니다.** 4차 작업 시점에 어떤 채널을 쓸지 확정되면 그때 해당 앱에 직접 추가하세요. 별도 패키지로 빼지 않습니다.

### 외부 모노레포 (GitHub private, CLI에서 접근 가능)

아래 레포들은 이미 구현되어 있습니다. **절대 재구현하지 말고 import해서 사용하세요.**

| 레포 | 경로 | 역할 |
|------|------|------|
| `lsy1234780/auth-lib` | `packages/auth-lib` (git submodule or pnpm link) | Supabase Auth / Keycloak 로그인·세션 |
| `lsy1234780/barqr-lib` | `packages/barqr-lib` | 바코드·QR 생성 및 BT 스캐너 읽기 |
| `lsy1234780/email-lib` | `packages/email-lib` | Resend 이메일 발송 |
| `lsy1234780/pdf-lib` | `packages/pdf-lib` | JSON → 견적서 PDF 생성 |

> 각 레포의 실제 export 인터페이스는 해당 레포의 `CLAUDE.md` 또는 `README.md`를 먼저 읽고 파악하세요.
> 추측으로 import하지 마세요.

---

## 기술 스택

### 공통
- **언어:** TypeScript 5 (strict mode)
- **패키지 매니저:** pnpm workspaces
- **빌드:** Turborepo
- **린트:** ESLint + Prettier

### 앱 (apps/*)
- **프레임워크:** Next.js 16 App Router
- **스타일:** Tailwind CSS + shadcn/ui (앱별 직접 설치)
- **폼:** react-hook-form + zod
- **서버 상태:** @tanstack/react-query
- **클라이언트 상태:** zustand (최소한으로)
- **유틸:** dayjs (날짜), numeral (금액 포맷), lucide-react (아이콘)

### 인프라
- **DB:** Supabase (PostgreSQL)
- **인증:** `auth-lib` (Supabase Auth + RLS)
- **스토리지:** Supabase Storage (PDF, 이미지)
- **배포:** Vercel
- **Edge Functions:** Supabase (복합 트랜잭션, 4차~)
- **실시간:** Supabase Realtime (대시보드, 4차~)

---

## 코딩 컨벤션

### 기본 규칙
- 들여쓰기: 2 스페이스
- 따옴표: 싱글 쿼트
- 세미콜론: 항상 포함
- `any` 사용 금지 — 불명확하면 `unknown` + 타입 가드
- `var` 사용 금지 — `const` / `let` 만 사용
- 주석: 한국어 허용, 변수·함수명은 영어

### 파일·폴더 네이밍
```
컴포넌트:     PascalCase   (ProductTable.tsx)
훅:           camelCase    (useInventory.ts)
유틸:         camelCase    (formatPrice.ts)
페이지:       kebab-case   (app/products/[id]/page.tsx — Next.js 규칙)
타입 파일:    camelCase    (quotation.types.ts)
```

### 반응형 / 모바일 퍼스트
- **모든 페이지는 모바일 퍼스트로 제작** — 모바일 레이아웃을 먼저 작성하고 `sm:`, `md:`, `lg:`, `xl:` 브레이크포인트로 확장
- 모바일에서 고정 상단바(h-14, 56px)가 있으므로, 콘텐츠 영역에 상단 여백 확보 필수 (layout.tsx에서 `pt-18 md:pt-6` 적용됨)
- 테이블·그리드는 모바일에서 카드형 또는 가로 스크롤로 대응
- 터치 타겟 최소 크기: 44px × 44px (모바일 버튼·링크)

### 컴포넌트 작성 규칙
- Server Component 기본, 인터랙션 필요할 때만 `'use client'` 추가
- Props 타입은 항상 명시 (`interface`, `type` 모두 허용)
- 컴포넌트 파일 1개당 1개의 주요 export

### Server Action / API Route
- 민감한 비즈니스 로직은 반드시 서버사이드에서 처리
- Server Action에서 세션 검증을 먼저 수행:
```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) throw new Error('Unauthorized');
```
- 복합 트랜잭션(재고 차감 + CRM 기록 등)은 Supabase Edge Function으로 분리 (4차~)

---

## 계층 구조 및 데이터 흐름

```
① DB (Supabase PostgreSQL + RLS)
        ↓
② 서버 (Next.js Server Action / Edge Function)
   — 세션 확인, 권한 체크, 비즈니스 로직
        ↓
③ BFF (Next.js Route Handler)
   — 파일 반환(PDF), 외부 웹훅 수신
        ↓
④ 프론트 (React Client Component)
   — UI 렌더링, 사용자 인터랙션
```

**절대 하면 안 되는 것:**
- 클라이언트 컴포넌트에서 Supabase service role key 사용
- 클라이언트에서 직접 재고 차감·주문 확정 처리
- RLS 없이 테이블에 직접 접근

---

## DB 스키마 (Supabase)

> Supabase 프로젝트 생성 및 키 발급은 사람이 직접 합니다.
> Agent는 마이그레이션 SQL을 작성하고 `supabase/migrations/` 에 저장하세요.

### 스키마 문서

- **현재 스키마 전체:** `docs/schema/current-schema.md`
- **확장 예정 스키마:** `docs/schema/expansion-schema.md`

### 핵심 테이블 요약

| 도메인 | 테이블 | 역할 |
|--------|--------|------|
| Master | products, categories, companies, company_products | 제품·업체·단가 |
| RBAC | departments, positions, role_groups, user_role_groups, menu_access_rules | 권한 |
| Sales | quotations, quotation_items, orders, order_items | 견적·수주 |
| Fulfillment | shipments, shipment_serials, receiving_orders, receiving_items, receiving_staging, inventory_items, inventory_movements | 입출고·재고 |
| CRM/Service | as_requests, as_logs, crm_logs | A/S·CRM |
| Logs | inventory_logs, access_logs | 이력 |

### 단가 결정 로직

```
company_products 레코드 있음?
├── YES → custom_price != null → custom_price 사용
│         custom_price == null → products.base_price 사용
└── NO  → is_visible_default = true인 제품만, base_price로 노출
```

### 주문 흐름 RPC

- `create_order_with_stock_deduction` — 재고 확인 + 주문 생성
- `confirm_order_with_stock_deduction` — 원자적 재고 차감 + 확정
- `cancel_order_with_stock_restore` — 취소 + 재고 복구
- `generate_inventory_items` — 재고 아이템 자동 생성 (시리얼/바코드 포함)

---

## 페이지 목록

### apps/admin

| 경로 | 기능 | 상태 |
|------|------|------|
| `/login` | 관리자 로그인 | ✅ |
| `/products` | 제품 목록, 바코드 생성, 기본단가 | ✅ |
| `/products/[id]` | 제품 상세, 재고 이력, 시리얼 관리 | ✅ |
| `/categories` | 카테고리 관리 | ✅ |
| `/inventory` | 재고 현황표 | ✅ |
| `/receiving` | 입고지시서 CRUD | ✅ |
| `/serials` | 시리얼 바코드 관리 (물류용, 가격 미노출) | ✅ |
| `/companies` | 업체 목록, 가입 승인/정지 | ✅ |
| `/companies/[id]` | 업체별 노출제품·단가·수량 설정 | ✅ |
| `/quotations` | 견적서 CRUD, PDF, 이메일 발송 | ✅ |
| `/orders` | 수주 관리, 견적 연동, 재고 차감 | ✅ |
| `/as` | A/S 요청 접수, 점검, 수리 이력 | ✅ |
| `/settings` | RBAC 설정 (부서/직급/그룹/메뉴/모듈) | ✅ |
| `/dashboard` | 현황 대시보드 | ✅ |
| `/inbox` | 통합 인박스 (멘션·레코드 대화·긴급 피드, 로그인 후 첫 화면) | ✅ |
| `/chat` | 팀 채팅 (채널/DM, 엔티티 멘션, 위젯) | ✅ |
| `/deals` | 영업 파이프라인 | ✅ |
| `/warehouses` | 창고 관리 | ✅ |
| `/receiving-orders` | 입고 작업 | ✅ |
| `/lots` | LOT 관리 | ✅ |
| `/warranty` | 출고현황 | ✅ |
| `/profit-loss` | 손익계산서 | ✅ |

### apps/b2b-portal

| 경로 | 차수 | 기능 |
|------|------|------|
| `/register` | 3차 | 업체 가입 신청 |
| `/login` | 3차 | 업체 로그인 |
| `/catalog` | 3차 | 업체별 노출 제품·단가 |
| `/quotation/new` | 3차 | 견적 생성 → PDF |
| `/orders` | 3차 | 발주 내역 |
| `/orders/new` | 3차 | 발주 생성 |
| `/orders/[id]` | 4차 | 발주 상태 추적 |

### apps/logistics

| 경로 | 차수 | 기능 |
|------|------|------|
| `/` | 4차 | 출고 지시 목록 |
| `/scan` | 4차 | 바코드 스캔 → 출고완료 |
| `/history` | 4차 | 출고 이력 |

---

## 외부 패키지 사용 가이드

### auth-lib
```ts
// 반드시 해당 레포 CLAUDE.md 읽고 실제 export 확인 후 사용
// Next.js 미들웨어에서 세션 보호
import { createServerClient } from '@lsy1234780/auth-lib/server';

// 예상 패턴 (실제 인터페이스는 레포에서 확인)
export async function middleware(request: NextRequest) {
  const { supabase, response } = createServerClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect('/login');
  return response;
}
```

### barqr-lib
```ts
// BT 스캐너 입고 처리
import { onScanInput } from '@lsy1234780/barqr-lib';

// 바코드 생성
import { generateBarcode } from '@lsy1234780/barqr-lib';
```

### email-lib
```ts
// 입고 알림, 주문 확정 메일
import { sendMail } from '@lsy1234780/email-lib';
```

### pdf-lib
```ts
// 견적서 PDF — 단가는 호출 측에서 결정해서 전달
import { generateQuotation } from '@lsy1234780/pdf-lib';

const buffer = await generateQuotation({
  quotationNumber: 'Q-2025-001',
  company: { name: 'AA유통' },
  items: [{ productName: '제품A', quantity: 10, unitPrice: 15000, totalPrice: 150000 }],
});
```

---

## 환경변수

> 실제 값은 사람이 직접 발급하고 `.env.local`에 입력합니다.
> Agent는 아래 키 이름을 기준으로 코드를 작성하세요.

```env
# Supabase (사람이 직접 입력)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # 서버사이드 전용, 클라이언트 노출 금지

# 외부 서비스 (사람이 직접 입력)
RESEND_API_KEY=
LINE_CHANNEL_ACCESS_TOKEN=

# 앱
NEXT_PUBLIC_APP_URL=
```

---

## 작업 순서 가이드

Agent가 작업을 시작할 때 아래 순서를 따르세요.

```
1. CLAUDE.md 숙지 (이 파일)
2. 관련 docs/ 문서 확인 (스키마, 아키텍처 등)
3. 해당 외부 패키지 레포의 CLAUDE.md / README.md 읽기
4. packages/database 의 타입 확인
5. 필요한 Supabase 마이그레이션 SQL 작성 (supabase/migrations/)
6. Server Action / Route Handler 작성
7. UI 컴포넌트 작성 (shadcn/ui 각 앱에서 직접 사용)
8. 페이지 조립
9. 미들웨어 인증 보호 확인
```

---

## 문서 관리 규칙

### 구조

```
docs/
├── architecture/       # 아키텍처 의사결정, 도메인 설계, 플랫폼 전략
├── schema/             # DB 스키마 레퍼런스, 확장 계획
└── scenario.md         # 업무 흐름 시퀀스 다이어그램
```

### 규칙

- **CLAUDE.md** — 코딩 지침, 컨벤션, 프로젝트 구조 등 Agent가 코드 작성 시 반드시 따를 규칙
- **docs/architecture/** — 비즈니스/기술 의사결정, 확장 방향. 코드에 직접 영향 없는 설계 문서
- **docs/schema/** — DB 테이블 정의. 새 테이블 추가 시 `current-schema.md` 업데이트
- 새 기능 추가 시 관련 문서도 같이 업데이트 (스키마, 페이지 목록 등)
- 문서 파일은 Markdown 형식 (`.md`)

---

## 차수별 작업 범위

현재 진행 차수를 확인하고, 해당 차수 범위 밖의 기능은 구현하지 마세요.

| 차수 | 핵심 목표 | 주요 테이블 | 사용 패키지 |
|------|-----------|-------------|-------------|
| 1차 | 제품 등록·바코드 생성·BT 스캐너 입고·라벨 프린트 | products, inventory_logs | barqr-lib, packages/database |
| 2차 | 어드민 로그인·재고표·견적서 PDF | quotations, quotation_items | auth-lib, pdf-lib |
| 3차 | B2B 포털·업체별 단가·발주 | companies, company_products, orders | email-lib |
| 4차 | 주문확정·재고차감·물류·CRM·알림·대시보드 | shipments, crm_logs | lib/alert.ts (앱 내부), Supabase Realtime |

---

## 하면 안 되는 것 (절대 금지)

- `SUPABASE_SERVICE_ROLE_KEY`를 클라이언트 컴포넌트에서 사용
- 외부 패키지(`auth-lib` 등) 내부 로직 재구현
- RLS 없이 테이블 직접 접근
- `any` 타입 사용
- 현재 차수 범위 밖의 기능 선구현
- `.env.local` 파일을 git에 커밋

---

## Git 워크플로우

### 브랜치 전략

- **`main` 직접 푸시 절대 금지** — 반드시 브랜치 → PR → 머지
- 브랜치 네이밍: `feat/기능명`, `fix/버그명`, `chore/작업명`, `refactor/대상`
- 예시: `feat/crm-dashboard`, `fix/serial-status-sync`, `chore/migration-cleanup`

### 고객별 브랜치 전략 (v1~)

`main`은 공용 베이스(v1)이며, 고객별 커스텀은 별도 브랜치에서 관리합니다.

```
main (v1 공용 베이스)
├── customer/company-a    ← A사 풀커스텀
├── customer/company-b    ← B사 풀커스텀
└── customer/company-c    ← C사 풀커스텀
```

**규칙:**
- 고객 브랜치 네이밍: `customer/고객명` (예: `customer/jungwook`, `customer/techsol`)
- 공통 기능/버그픽스는 `main`에서 작업 → 각 고객 브랜치로 `/sync-main`으로 머지
- **고객 브랜치 → main 역머지 절대 금지** (커스텀이 공용에 섞임)
- 릴리즈 태그: `v1.0.0`, `v1.1.0` 등으로 공용 베이스 마킹
- 고객별 Supabase 프로젝트는 별도 (`.env.local`로 분리)

### 브랜치 전환 안전 규칙

브랜치를 전환하기 전에 **반드시** 작업 중인 변경사항을 보호하세요:

```
1. git status 로 변경사항 확인
2. 변경사항이 있으면:
   a. 커밋할 수 있으면 커밋
   b. 아직 커밋할 단계가 아니면 git stash push -m "설명" 으로 임시 저장
   c. untracked 파일도 보호: git stash push -u -m "설명"
3. 브랜치 전환 (git checkout ...)
4. 돌아왔을 때: git stash pop 으로 복원
```

**절대 하면 안 되는 것:**
- 변경사항이 있는 상태에서 `git checkout` (작업물 손실 위험)
- `git checkout -- .` 또는 `git restore .` (명시적 요청 없이 변경사항 폐기 금지)
- `git stash drop` (명시적 요청 없이 stash 삭제 금지)

### 커밋 컨벤션

```
<type>(<scope>): <설명>

type: feat | fix | chore | refactor | docs | style | test
scope: admin | logistics | b2b-portal | database | 생략 가능
설명: 한국어 또는 영어, 현재형으로 작성
```

**예시:**
```
feat(admin): 입고지시서 CRUD 구현
fix(admin): 시리얼 상태 변경 시 RLS 오류 수정
chore(database): role_groups 테이블 마이그레이션 추가
refactor(admin): createAdminClient를 쿠키 없는 방식으로 변경
docs: CLAUDE.md 권한 시스템 섹션 추가
```

### 커밋 분할 규칙

하나의 PR에 여러 변경이 있을 때 **논리적 단위로 커밋을 분리**하세요:

1. **마이그레이션 SQL** — DB 스키마 변경은 별도 커밋
2. **Server Action / API** — 백엔드 로직은 별도 커밋
3. **UI 컴포넌트** — 프론트엔드는 별도 커밋
4. **설정/린트/타입** — 인프라 변경은 별도 커밋

**나쁜 예:** `feat: 전부 다 했음` (한 커밋에 마이그레이션 + 액션 + UI + 설정)
**좋은 예:**
```
chore(database): receiving_orders 테이블 마이그레이션
feat(admin): 입고지시서 Server Action 구현
feat(admin): 입고지시서 UI 페이지 구현
```

### PR 규칙

- PR 제목: 커밋 컨벤션과 동일한 형식
- PR 본문: 변경 사항 요약 + 테스트 방법
- 리뷰어 지정 필수 (1명 이상)
- CI 통과 후 머지
- **Squash merge 금지** — 커밋 히스토리 유지

### 주의사항

- `--force-push` 금지 (공유 브랜치에서)
- `.env.local` 파일 커밋 금지 (`.gitignore`에 포함됨)
- `node_modules/`, `.next/` 커밋 금지
- 대용량 바이너리 파일은 가급적 피하기 (이미지/PDF는 Supabase Storage 사용)

---

## 권한 시스템 (RBAC)

### 구조

```
유저 → app_metadata { department, position }
      → user_role_groups (N:N) → role_groups { allowed_menus[] }
메뉴 → menu_access_rules { allowed_departments[], allowed_positions[] }
```

### 접근 판정 순서

```
1. director(이사) → 모든 메뉴 접근
2. 외부 링크 (http...) → 항상 접근
3. 그룹 롤의 extraMenus에 포함 → 접근
4. menu_access_rules에서 부서+직급 AND 조건 판정
   - allowed_departments 빈 배열 → 전체 부서 허용
   - allowed_positions 빈 배열 → 전체 직급 허용
   - 둘 다 값 있으면 → 부서 AND 직급 모두 해당해야 접근
```

### 주요 파일

| 파일 | 역할 |
|------|------|
| `apps/admin/lib/roles.ts` | 타입 정의, `canAccessMenu()`, `parseRole()` |
| `apps/admin/actions/roleGroups.ts` | 그룹 CRUD, 유저-그룹 배정/해제 |
| `apps/admin/actions/menuAccess.ts` | 메뉴 접근 규칙 조회/저장 |
| `apps/admin/actions/auth.ts` | `getUserRole()`, `updateUserRole()` |
| `apps/admin/app/(admin)/layout.tsx` | 레이아웃에서 역할+그룹+규칙 fetch → Sidebar 전달 |
| `apps/admin/components/Sidebar.tsx` | `canAccessMenu()`로 메뉴 필터링 |
| `apps/admin/app/(admin)/settings/` | 역할 그룹/메뉴 권한/유저 관리 UI |

### Supabase 클라이언트 사용 규칙

- **읽기 (SELECT):** `createClient()` — 유저 세션 기반, RLS 적용
- **쓰기 (INSERT/UPDATE/DELETE) + 권한 필요:** `createAdminClient()` — service role, RLS 우회
  - 반드시 서버 액션에서 `requireSuperAdmin()` 등 권한 체크 후 사용
  - `createAdminClient()`는 쿠키 없이 `@supabase/supabase-js` 직접 생성 (세션 간섭 방지)

---

## 현재 구현 현황

### 완료된 기능

| 영역 | 기능 | 주요 경로 |
|------|------|-----------|
| 제품 | 제품 CRUD, 바코드 생성, 카테고리 | `/products`, `/categories` |
| 재고 | 재고 현황표, BT 스캐너 입고 | `/inventory` |
| 입고 | 입고지시서 CRUD (admin + logistics) | `/receiving` |
| 시리얼 | 제품별 시리얼 바코드 관리, 일괄 인쇄 | `/serials`, `/products/[id]` |
| 업체 | 업체 관리, 가입 승인, 단가 설정 | `/companies` |
| 견적 | 견적서 CRUD, PDF, 이메일 발송, 커스텀 항목 | `/quotations` |
| 수주 | 주문 관리, 견적 연동, 메모 | `/orders` |
| A/S | AS 요청 접수, 점검, 수리 이력 관리 | `/as` |
| B2B | 업체 포털 (카탈로그, 발주, 견적) | `apps/b2b-portal` |
| 물류 | 출고 관리, 입고 확인 (PWA) | `apps/logistics` |
| 권한 | 부서/직급 RBAC, 그룹 롤, 메뉴 접근 설정 | `/settings` |
| 협업 | 팀 채팅(채널/DM/위젯/엔티티 멘션), 레코드 스레드(수주·제품·거래처·A/S 상세에 대화 부착), ERP 봇 이벤트, 통합 인박스 | `/chat`, `/inbox`, 각 상세 페이지 |

### DB 마이그레이션 파일

`supabase/migrations/` 디렉토리에 순번대로 존재. 새 마이그레이션은 다음 번호로 작성:
```
현재 마지막: 070_record_threads.sql
다음 작성 시: 071_xxx.sql
```

---

## 확장 계획 (마스터 백오피스)

> 상세 문서는 `docs/` 디렉토리를 참조하세요.

| 문서 | 경로 | 내용 |
|------|------|------|
| 도메인 맵 | `docs/architecture/domain-map.md` | 멀티 도메인 구조, serial_mode, 앱 분리 전략, 로드맵 |
| 플랫폼 전략 | `docs/architecture/platform-strategy.md` | Tauri(데스크톱) + Capacitor(모바일) + 웹 전략 |
| AI Agent 설계 | `docs/architecture/ai-agent-design.md` | inventory_ledger, 분석용 View, Agent API 설계 |
| 현재 스키마 | `docs/schema/current-schema.md` | 전체 DB 테이블 레퍼런스 (마이그레이션 001~029) |
| 확장 스키마 | `docs/schema/expansion-schema.md` | Supply Chain, CRM, 정산, RMA, 리퍼브, Analytics |
| 시나리오 플로우 | `docs/scenario.md` | 주요 업무 흐름 시퀀스 다이어그램 |

### 핵심 요약

- **DB는 공유, 앱은 분리** — 시스템 A(전자기기)와 B(로봇)를 하나의 DB로 관리
- **`products.serial_mode`** — `none` / `pool` / `strict`로 제품별 관리 방식 선언
- **플랫폼:** admin → Tauri 데스크톱, logistics → PWA/Capacitor 모바일, b2b-portal → 웹 유지
- **AI Agent:** inventory_ledger(재고 원장) + 분석용 View + 읽기 전용 API로 연동
- **개발 순서:** Next.js 웹으로 전체 기능 완성 후, 4차 시점에 데스크톱/모바일 래퍼 추가

---

## Supabase MCP 연동

고객별 Supabase 프로젝트를 Claude Code에서 직접 관리할 수 있도록 MCP 서버를 설정합니다.

### 설정 방법

`.claude/settings.local.json`에 고객별 MCP 서버를 추가:

```json
{
  "mcpServers": {
    "supabase-base": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=<공용_PROJECT_REF>"
    },
    "supabase-customer-a": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=<A사_PROJECT_REF>"
    }
  }
}
```

- 처음 연결 시 브라우저에서 Supabase OAuth 인증 필요 (사람이 직접)
- `project_ref`로 스코핑하면 해당 프로젝트만 접근 가능 (교차 접근 방지)
- **프로덕션 DB는 읽기 전용으로만 연결** — 개발/스테이징에서만 쓰기 허용

### 지원 기능

- DB 스키마 조회, SQL 실행, 마이그레이션 적용
- TypeScript 타입 자동 생성
- 서비스 로그 조회 (API, Postgres, Auth, Storage)
- Edge Function 관리

---

## Slash Commands (스킬)

비개발자도 사용할 수 있는 Git 운영 명령어입니다.

| 명령어 | 용도 | 사용 시점 |
|--------|------|-----------|
| `/new-customer` | 새 고객 온보딩 (Supabase + 브랜치 + env + 계정 + Vercel) | 새 고객 계약 후 최초 세팅 |
| `/switch-customer` | 고객 브랜치 전환 + env 자동 교체 | 다른 고객 작업으로 전환할 때 |
| `/sync-main` | main 최신 변경을 현재 고객 브랜치에 머지 | main에 공통 업데이트가 올라온 후 |
| `/create-pr` | 현재 브랜치 → main PR 생성 (`--merge`로 즉시 머지) | 공통 기능 작업 완료 후 |
| `/deploy-preview` | 현재 브랜치를 Vercel 프리뷰 배포 | 고객에게 미리보기 보여줄 때 |

> 스킬 파일은 `.claude/commands/` 디렉토리에 위치합니다.

---

## 라이선스

MIT
