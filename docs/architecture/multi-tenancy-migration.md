# 멀티테넌시 마이그레이션 설계

> 목적: 기존 "한 DB = 한 회사" ERP를 **"한 DB = 여러 회사(워크스페이스)"** 구조로 전환.
> 대상 독자: 이 설계를 실행할 개발자. (비개발자 오너는 "개념"과 "단계"만 이해하면 됨)
> 작성 기준 마이그레이션: 현재 마지막 `040` → 이 문서는 `041`부터 제안.

---

## 0. 개념 (비개발자용 5줄 요약)

- **workspace(워크스페이스)** = 회사 하나가 쓰는 격리된 공간. 아파트 한 세대.
- 모든 데이터 테이블에 `workspace_id`(몇 호 거) 라벨을 붙인다.
- **RLS(Row Level Security)** = 로그인한 사람의 워크스페이스 데이터만 자동으로 보이게 하는 DB 자물쇠.
- 라벨(`workspace_id`)이나 자물쇠(RLS)가 **하나라도 빠진 테이블 = 데이터 유출 구멍.** 그래서 빠짐없이, 단계적으로.
- 로그인 페이지는 하나. 로그인하면 세션이 "너는 A 워크스페이스 소속"임을 알고, 자물쇠가 알아서 A 데이터만 보여줌.

---

## 1. ⚠️ 가장 중요한 구분 — workspace ≠ company

기존 스키마에 이미 `companies` 테이블이 있다. **헷갈리면 안 된다.**

| 용어 | 의미 | 예시 |
|------|------|------|
| **workspace** (신규) | Flexible을 **사용하는** 회사 = 우리 고객 = 테넌트 | "정욱상사가 Flexible 가입함" |
| **company** (기존) | 그 회사의 **거래처/고객** | "정욱상사의 거래처 AA유통" |

→ `workspace_id`는 **모든 것 위에 있는 최상위 격리 단위.** `companies`를 포함한 거의 모든 테이블에 붙는다.

---

## 2. 신규 테이블 3개

### 2-1. `workspaces` — 테넌트 본체

```sql
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- 회사명
  slug text unique not null,           -- acme → acme.flexible.app
  plan text not null default 'basic'   -- basic | standard | premium
    check (plan in ('basic','standard','premium')),
  status text not null default 'active'
    check (status in ('active','suspended')),
  created_at timestamptz default now()
);
```

### 2-2. `workspace_members` — 누가 어느 워크스페이스 소속인가

```sql
create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'  -- owner | admin | member
    check (role in ('owner','admin','member')),
  created_at timestamptz default now(),
  unique(workspace_id, user_id)
);
```

> 한 사람이 여러 워크스페이스에 속할 수 있음(나중에 워크스페이스 전환 기능의 토대). 지금은 보통 1:1.

### 2-3. `workspace_modules` — "모듈 넣다 뺐다"의 저장소 (보너스)

```sql
create table workspace_modules (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  module_key text not null,            -- 'partners','leads','inventory','chat' ...
  enabled boolean not null default true,
  primary key (workspace_id, module_key)
);
```

> 프로토타입의 "모듈 조립"이 실제로 사는 곳. 멀티테넌시랑 같이 깔아두면 나중에 모듈 토글 기능이 이 테이블만 읽으면 됨.

---

## 3. 기존 테이블에 `workspace_id` 추가

### 3-1. 대상 테이블 (전부)

원칙: **자식 테이블도 직접 `workspace_id`를 가진다** (비정규화). 그래야 테이블마다 독립적으로 자물쇠를 걸 수 있어 안전.

```
Master       : products, categories, companies, company_products
Sales        : quotations, quotation_items, orders, order_items
Fulfillment  : shipments, shipment_serials, receiving_orders, receiving_items,
               receiving_staging, inventory_items, inventory_movements, product_lots
CRM/Service  : as_requests, as_logs, crm_logs
Logs         : inventory_logs, access_logs
RBAC         : role_groups, user_role_groups, menu_access_rules,
               departments, positions   ← 특수 케이스(아래 3-3)
```

### 3-2. 일반 테이블 — 컬럼 추가 패턴

```sql
-- 예: products (나머지 일반 테이블도 동일 패턴)
alter table products
  add column workspace_id uuid references workspaces(id);
-- (이 단계에선 NULL 허용 — 4단계에서 백필 후 NOT NULL로)
```

### 3-3. ⚠️ 특수 케이스 — PK가 바뀌는 테이블

이 테이블들은 PK가 워크스페이스와 충돌해서 **기본키 구조를 바꿔야 함:**

```sql
-- menu_access_rules: menu_href가 PK였음 → 워크스페이스마다 같은 메뉴 규칙 필요
alter table menu_access_rules add column workspace_id uuid references workspaces(id);
alter table menu_access_rules drop constraint menu_access_rules_pkey;
alter table menu_access_rules add primary key (workspace_id, menu_href);

-- departments / positions: text id('sales','manager')가 PK → 워크스페이스별로 다를 수 있음
-- → 복합키 (workspace_id, id)로 변경. 이를 참조하는 FK도 같이 조정 필요(개발자 확인).
```

> 이 셋은 손이 더 가니, 개발자가 FK 참조 관계를 추적해서 같이 고쳐야 함. (4-2 RBAC 항목 참고)

---

## 4. 단계별 실행 계획 (안전 최우선 — 라이브 안 깨지게)

각 단계는 **앱이 계속 돌아가는 상태**로 진행. 한 번에 다 하지 않는다.

### Phase 0 — 신규 테이블만 추가 (영향 0)
- `041_workspaces.sql` : workspaces, workspace_members, workspace_modules 생성
- 기존 앱 동작 변화 없음. 안전하게 먼저 머지 가능.

### Phase 1 — `workspace_id` 컬럼 추가 (NULL 허용) + 백필
- `042_add_workspace_id.sql` : 모든 대상 테이블에 `workspace_id` 추가 (nullable)
- **백필:** 기존 데이터 전부를 "기본 워크스페이스 1개"에 귀속
  ```sql
  insert into workspaces (name, slug) values ('정욱상사', 'jungwook')
    returning id;  -- 이 id를 아래에 사용
  update products set workspace_id = '<위 id>' where workspace_id is null;
  -- ... 모든 테이블 반복 ...
  -- 기존 어드민 유저도 멤버로 등록
  insert into workspace_members (workspace_id, user_id, role)
    select '<위 id>', id, 'owner' from auth.users;
  ```
- 이 시점에도 앱은 그대로 동작(아직 자물쇠 안 걸림).

### Phase 2 — 앱이 workspace를 인식하게 (코드 변경)
- **세션→워크스페이스 주입:** 로그인 후, 그 유저의 `workspace_id`를 알아내서 모든 쿼리에 자동 적용.
  - 기존 코드가 `createAdminClient()`/`createClient()`를 서버액션에서 쓰는 구조라 **주입 지점이 한 곳**임 = 유리.
- **신규 가입 흐름:** 회원가입 시 `workspaces` + `workspace_members(owner)` 자동 생성.
- **라우팅:** `acme.flexible.app`(서브도메인) 또는 `/w/acme`(경로)로 워크스페이스 맥락 표시.

### Phase 3 — RLS 자물쇠 걸기 (반드시 스테이징에서 먼저!)
- `043_rls_tenant_isolation.sql` : 헬퍼 함수 + 전 테이블 정책
  ```sql
  -- 로그인 유저가 속한 워크스페이스 id들
  create or replace function current_workspace_ids()
  returns setof uuid language sql security definer stable as $$
    select workspace_id from workspace_members where user_id = auth.uid()
  $$;

  -- 테이블마다 정책 (예: products)
  alter table products enable row level security;
  create policy products_tenant on products for all
    using (workspace_id in (select current_workspace_ids()))
    with check (workspace_id in (select current_workspace_ids()));
  ```
- 백필 끝났으면 `workspace_id`를 **NOT NULL**로 잠금:
  ```sql
  alter table products alter column workspace_id set not null;
  ```

### Phase 4 — 격리 검증 (안전망, 생략 금지)
- `044` 또는 테스트 코드: **A로 로그인 → B 데이터 조회 시도 → 빈 결과**여야 통과.
- **"workspace_id 없거나 RLS 없는 테이블 0개" 자동 점검** 쿼리:
  ```sql
  -- workspace_id 컬럼 없는 public 테이블 찾기 (있으면 빨간불)
  select table_name from information_schema.tables t
   where table_schema='public'
     and table_name not in ('workspaces','workspace_members','workspace_modules')
     and not exists (
       select 1 from information_schema.columns c
        where c.table_name=t.table_name and c.column_name='workspace_id');
  ```

---

## 5. RBAC와의 관계 (개발자 주의)

기존 RBAC(부서/직급/그룹롤/메뉴규칙)는 이제 **워크스페이스 안에서** 동작해야 함:
- `role_groups`, `menu_access_rules`, `departments`, `positions` 전부 `workspace_id` 스코프.
- `canAccessMenu()` 등 권한 판정 코드가 **현재 워크스페이스 기준**으로 데이터를 읽도록 조정.
- 즉 권한은 2층 구조가 됨: ① workspace 격리(RLS) → ② workspace 안에서 부서/직급 권한(기존 RBAC).

---

## 6. 하이브리드(SI 고객)와의 호환

이 설계는 **별도 Supabase를 쓰는 큰 고객과도 100% 호환**됨:
- 별도 DB 고객 = 그 DB에 `workspaces` 행이 **딱 하나** 있는 것뿐.
- 같은 코드·같은 마이그레이션이 공유DB(여러 workspace)와 전용DB(workspace 1개) 양쪽에서 동일하게 작동.
- 따라서 기존 `/new-customer`(전용 DB 프로비저닝) SI 흐름은 그대로 두고, 공유DB 셀프가입만 새로 추가하면 하이브리드 완성.

---

## 7. 비개발자 오너가 결정/확인해야 할 것

1. **워크스페이스 식별 방식:** 서브도메인(`acme.flexible.app`) vs 경로(`/w/acme`) — 브랜딩/난이도 차이. (추천: 서브도메인, 단 약간 더 복잡)
2. **기존 데이터의 기본 워크스페이스 이름/slug** (Phase 1 백필용). 예: 친구 회사가 이미 쓰던 그 ERP의 회사명.
3. **이 작업은 개발자 친구가 실행** — 이 문서를 그대로 넘기면 됨. 특히 Phase 3(RLS)는 **반드시 스테이징(테스트 DB)에서 검증 후** 운영 적용.

---

## 8. 요약 체크리스트

- [ ] Phase 0: `041` workspaces/members/modules 테이블
- [ ] Phase 1: `042` 전 테이블 workspace_id(nullable) + 기본 워크스페이스 백필
- [ ] Phase 2: 세션→workspace 주입 + 가입 흐름 + 라우팅 (코드)
- [ ] Phase 3: `043` RLS 정책 + workspace_id NOT NULL (스테이징 선검증)
- [ ] Phase 4: `044` 격리 테스트 + 누락 점검
- [ ] 특수 케이스 PK 변경: menu_access_rules, departments, positions
- [ ] RBAC 코드 워크스페이스 스코프화
