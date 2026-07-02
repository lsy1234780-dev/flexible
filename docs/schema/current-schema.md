# 현재 DB 스키마 레퍼런스

> 이 문서는 현재 운영 중인 Supabase DB의 전체 테이블 구조입니다.
> 마이그레이션 파일: `supabase/migrations/001~070`
> (참고: 본문 상세는 주요 테이블 위주 — 030 이후 추가 테이블은 하단 마이그레이션 목록과 각 SQL 파일 참조)

---

## Master Data

### products (제품 마스터)

```sql
products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  barcode text UNIQUE NOT NULL,
  base_price numeric NOT NULL,
  base_stock integer DEFAULT 0,
  is_visible_default boolean DEFAULT true,
  category_id uuid REFERENCES categories(id),
  width_cm numeric,
  height_cm numeric,
  depth_cm numeric,
  weight_kg numeric,
  image_url text,
  description text,
  is_temporary boolean DEFAULT false,   -- 임시 제품 플래그
  serial_mode text NOT NULL DEFAULT 'pool'
    CHECK (serial_mode IN ('none', 'pool', 'strict')),
    -- none: 수량만 관리 (개별 시리얼 없음)
    -- pool: 자체 바코드 발급 (unit_barcode 자동생성)
    -- strict: 제조사 시리얼 필수 입력
  created_at timestamptz DEFAULT now()
)
```

### categories (카테고리)

```sql
categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES categories(id),  -- 셀프 참조 (계층 구조)
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
)
```

### companies (업체)

```sql
companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text CHECK (type IN ('admin', 'b2b')) NOT NULL,
  status text CHECK (status IN ('pending', 'active', 'suspended')) DEFAULT 'pending',
  auth_user_id uuid REFERENCES auth.users(id),   -- B2B 포털 로그인 연결
  contact_name text,
  contact_phone text,
  contact_email text,
  contact_position text,
  created_at timestamptz DEFAULT now()
)
```

### company_products (업체별 단가·수량 오버라이드)

```sql
company_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  product_id uuid REFERENCES products(id),
  custom_price numeric,             -- null이면 base_price
  visible_stock integer,            -- null이면 stock_ratio 적용
  is_visible boolean DEFAULT true,
  stock_ratio numeric,              -- base_stock * ratio = 노출 수량
  max_visible_stock integer,        -- ratio 적용 시 상한선
  UNIQUE(company_id, product_id)
)
```

**단가/수량 결정 로직:**
```
visible_stock 직접 지정 → 해당 값
stock_ratio 있음 → base_stock * ratio (max_visible_stock 이하)
둘 다 없음 → base_stock 그대로
```

---

## RBAC (권한)

### departments / positions

```sql
departments (
  id text PRIMARY KEY,      -- 'management', 'sales', 'logistics' 등
  label text NOT NULL,      -- '경영', '영업', '물류'
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
)

positions (
  id text PRIMARY KEY,      -- 'staff', 'manager', 'director'
  label text NOT NULL,      -- '사원', '팀장', '이사'
  level integer DEFAULT 0,  -- 높을수록 상위
  created_at timestamptz DEFAULT now()
)
```

### role_groups / user_role_groups

```sql
role_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  allowed_menus text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
)

user_role_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_group_id uuid NOT NULL REFERENCES role_groups(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role_group_id)
)
```

### menu_access_rules

```sql
menu_access_rules (
  menu_href text PRIMARY KEY,
  allowed_departments text[] NOT NULL DEFAULT '{}',   -- 빈 배열 = 전체 허용
  allowed_positions text[] NOT NULL DEFAULT '{}',     -- 빈 배열 = 전체 허용
  updated_at timestamptz DEFAULT now()
)
```

---

## Sales (영업)

### quotations / quotation_items (견적서)

```sql
quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  number text UNIQUE NOT NULL,
  status text CHECK (status IN ('draft', 'sent', 'confirmed')) DEFAULT 'draft',
  order_id uuid REFERENCES orders(id),     -- 수주 연동
  issued_at timestamptz DEFAULT now(),
  issued_by text,                          -- 발행자 이메일
  created_at timestamptz DEFAULT now()
)

quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid REFERENCES quotations(id),
  product_id uuid REFERENCES products(id),  -- nullable (커스텀 항목)
  quantity integer NOT NULL,
  unit_price numeric,                       -- nullable (음수 = 할인)
  label text,                              -- 커스텀 항목명
  is_taxable boolean DEFAULT true
)
-- CHECK: product_id OR label 중 하나는 반드시 존재
```

### orders / order_items (수주)

```sql
orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  order_number text UNIQUE,     -- 자동생성: ORD-YYMMDD-NNN
  status text CHECK (status IN (
    'pending', 'confirmed', 'shipped', 'packed', 'completed', 'cancelled'
  )) DEFAULT 'pending',
  confirmed_at timestamptz,
  confirmed_by text,
  notes text,
  created_at timestamptz DEFAULT now()
)

order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  product_id uuid REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0)
)
```

**주문 흐름 RPC:**
- `create_order_with_stock_deduction` — 재고 확인 + 주문 생성
- `confirm_order_with_stock_deduction` — 원자적 재고 차감 + 확정
- `cancel_order_with_stock_restore` — 취소 + 재고 복구

---

## Fulfillment (물류)

### shipments (출고)

```sql
shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  status text CHECK (status IN ('pending', 'in_progress', 'packed', 'completed'))
    DEFAULT 'pending',
  shipped_at timestamptz,
  packed_at timestamptz,
  completed_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz DEFAULT now()
)
```

### receiving_orders / receiving_items (입고지시서)

```sql
receiving_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id text,
  title text,
  status text CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))
    DEFAULT 'pending',
  memo text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)

receiving_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_order_id uuid REFERENCES receiving_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  expected_quantity integer NOT NULL DEFAULT 0,
  received_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(receiving_order_id, product_id)
)
```

### receiving_staging (입고 스테이징)

```sql
receiving_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  quantity integer DEFAULT 1,
  scanned_barcode text,
  memo text,
  matched_receiving_item_id uuid REFERENCES receiving_items(id),
  matched_at timestamptz,
  created_at timestamptz DEFAULT now()
)
```

### inventory_items (재고 아이템)

> 구 `product_serials` → 039 마이그레이션으로 리네임. 재고 로우가 주체, 시리얼은 부가 컬럼.

```sql
inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  serial_number integer,                  -- pool/strict: 자동채번, none: NULL
  unit_barcode text,                      -- 개별 바코드 (nullable, partial unique)
  manufacturer_serial text,               -- 제조사 시리얼 (있으면 입력)
  receiving_item_id uuid REFERENCES receiving_items(id),
  receiving_staging_id uuid REFERENCES receiving_staging(id),
  lot_id uuid REFERENCES product_lots(id),
  location text,                          -- 위치 (향후 사용)
  status text CHECK (status IN (
    'receiving', 'in_stock', 'reserved', 'shipped', 'sold', 'disposed'
  )) DEFAULT 'in_stock',
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, serial_number) WHERE serial_number IS NOT NULL
)
```

**재고 생성 RPC:** `generate_inventory_items(p_product_id, p_quantity, p_receiving_item_id, p_lot_id, p_generate_unit_barcode)`

### inventory_movements (재고 이동 이력)

```sql
inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id),
  from_status text,
  to_status text,
  from_location text,
  to_location text,
  quantity integer DEFAULT 1,
  reason text,                            -- 입고확정, 위치이동, 출고예약 등
  memo text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
)
```

---

## CRM / Service

### as_requests (A/S 요청)

```sql
as_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,          -- AS-YYYY-NNN
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  product_name text NOT NULL,           -- 자유 입력
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  serial_number text,
  symptom text NOT NULL,
  defective_parts text[] DEFAULT '{}',  -- 고장 부위 배열
  inspection_content text,              -- 검수 진단 내용
  repair_content text,                  -- 수리 내용
  status text CHECK (status IN (
    'received', 'inspecting', 'repairing', 'completed', 'returned'
  )) DEFAULT 'received',
  assigned_to text,
  estimated_completion_at date,
  completed_at timestamptz,
  repair_cost numeric,
  memo text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()  -- 트리거로 자동 갱신
)
```

### as_logs (A/S 처리 이력)

```sql
as_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_request_id uuid REFERENCES as_requests(id) ON DELETE CASCADE,
  status text NOT NULL,
  content text,
  created_by_name text,
  created_at timestamptz DEFAULT now()
)
```

### crm_logs (CRM 이력)

```sql
crm_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  order_id uuid REFERENCES orders(id),
  action text NOT NULL,
  memo text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
)
```

---

## Logs

### inventory_logs (재고 입출고 이력)

```sql
inventory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  quantity integer NOT NULL,
  type text CHECK (type IN ('in', 'out')) NOT NULL,
  memo text,
  scanned_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
)
```

### access_logs (접속 로그)

```sql
access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
)
```

---

## Chat / 협업 (060~070)

> 모든 채팅 테이블은 `workspace_id` + 표준 ws_isolation RLS. realtime은 messages·message_reactions에 켜져 있음.

### channels (채널 · DM · 레코드 스레드)

```sql
channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'channel'
    CHECK (kind IN ('channel', 'dm', 'record')),
    -- channel: 공개 채널 / dm: 1:1 (channel_members 2명)
    -- record: 레코드 스레드 (수주·제품·거래처·A/S에 붙는 대화, 070)
  is_private boolean NOT NULL DEFAULT false,
  entity_type text,        -- kind='record'일 때 'order','product','company','as','receiving'
  entity_id uuid,          -- 레코드 id (다형성, FK 없음)
  entity_label text,       -- 표시용 스냅샷 (ORD-2025-0845 등)
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
)
-- UNIQUE (workspace_id, entity_type, entity_id) WHERE kind = 'record'
```

### channel_members (멤버십 + 읽음 상태)

```sql
channel_members (
  channel_id uuid REFERENCES channels(id),
  user_id uuid REFERENCES auth.users(id),
  workspace_id uuid NOT NULL,
  last_read_at timestamptz,       -- 안읽음 계산 기준
  PRIMARY KEY (channel_id, user_id)
)
```

### messages (메시지)

```sql
messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  channel_id uuid REFERENCES channels(id),
  author_id uuid REFERENCES auth.users(id),
  author_name text,               -- 표시용 비정규화
  body text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,  -- ERP 봇 이벤트 (수주 확정·출고·입고 등 자동 기록, 070)
  context_type text, context_id uuid,        -- (060 예비 컬럼 — 현재 미사용, 레코드 스레드는 kind='record' 채널 방식)
  reply_to uuid REFERENCES messages(id),
  edited_at timestamptz,
  deleted_at timestamptz,         -- soft delete
  created_at timestamptz DEFAULT now()
)
```

### message_mentions / message_reactions / message_attachments

```sql
message_mentions (   -- 엔티티 멘션 (양방향 링크의 심장, 다형성)
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  message_id uuid REFERENCES messages(id),
  entity_type text NOT NULL,      -- 'user','company','order','product','quotation','as','deal'...
  entity_id uuid NOT NULL,
  label text NOT NULL             -- 멘션 시점 표시 스냅샷
)

message_reactions (  -- 이모지 반응
  message_id uuid, user_id uuid, emoji text,
  UNIQUE (message_id, user_id, emoji)
)

message_attachments ( -- 파일 첨부 (Storage: chat-attachments 버킷)
  message_id uuid, storage_path text, file_name text, mime_type text, size_bytes bigint
)
```

### 채팅 RPC

| 함수 | 역할 |
|------|------|
| `get_my_channels()` | 공개 채널 + 내 DM 목록 (record 스레드 제외) + 안읽음 수 |
| `get_or_create_dm(p_other)` | 1:1 DM 찾기/생성 (멱등) |
| `get_or_create_record_channel(p_ws, p_type, p_id, p_label)` | 레코드 스레드 채널 찾기/생성 (멱등, 070) |
| `mark_channel_read(p_channel)` | 읽음 처리 (last_read_at) |
| `get_my_mentions(p_limit)` | 나를 멘션한 메시지 + 안읽음 + 레코드 정보 (070에서 확장) |
| `get_record_activity(p_limit)` | 레코드 스레드 최근 활동 (인박스 피드, 070) |
| `seed_default_channels(p_ws)` | #general 시드 |

---

## 마이그레이션 파일 목록

| # | 파일 | 내용 |
|---|------|------|
| 001 | initial_1st_phase | products, inventory_logs |
| 002 | 2nd_phase | companies, quotations, orders |
| 003 | company_products_stock_controls | stock_ratio, max_visible_stock |
| 004 | companies_auth_user | auth_user_id |
| 005 | orders_b2b | B2B 주문 |
| 006 | access_logs | 접속 로그 |
| 007 | orders_quotations_rls | RLS 정책 |
| 008 | order_flow_redesign | 주문 흐름 RPC |
| 009 | company_contacts | 담당자 연락처 |
| 010 | product_details | 제품 물리 스펙 |
| 011 | categories | 카테고리 |
| 012 | order_flow_v2 | shipments, crm_logs, 확정/취소 RPC |
| 013 | inventory_log_memo | memo 컬럼 |
| 014 | order_number | 자동 번호 생성 |
| 015 | order_packed_status | packed 상태 |
| 016 | shipment_notified_at | 알림 시간 |
| 017 | receiving_and_serials | 입고지시서, 시리얼 |
| 018 | receiving_orders_patch | 입고 패치 |
| 019 | fix_generate_product_serials | 시리얼 RPC 수정 |
| 020 | receiving_staging | 스테이징 |
| 021 | order_notes | 주문 메모 |
| 022 | quotation_custom_items | 커스텀 견적 항목 |
| 023 | issued_confirmed_by | 발행/확정자 |
| 024 | role_groups | 역할 그룹 |
| 025 | fix_role_groups_rls | RLS 수정 |
| 026 | menu_access_rules | 메뉴 접근 규칙 |
| 027 | departments_positions | 부서/직급 |
| 028 | as_requests | A/S 요청 |
| 029 | as_inspection_content | 검수 내용 컬럼 |
| 030 | product_lots | LOT 관리 테이블 |
| 031 | generate_serials_with_lot | 시리얼 RPC에 lot_id 추가 |
| 032 | receiving_items_lot | receiving_items.lot_id 추가 |
| 033 | receiving_confirmation | 입고 확정 플로우 (awaiting_confirmation, manufacturer_serial) |
| 034 | serial_mode_and_unit_barcode | products.serial_mode + serial_barcode→unit_barcode 리네임 |
| 035 | shipment_serials | 출고 시리얼 추적 (shipment_serials 테이블) |
| 036 | shipment_serial_source | shipments.serial_source 컬럼 |
| 037 | serial_level_l0_l3 | 시리얼 레벨 L0~L3 |
| 038 | unit_barcode_nullable | unit_barcode nullable + RPC p_generate_unit_barcode |
| 039 | inventory_items_rename | product_serials → inventory_items 리네임, location/receiving 상태 추가 |
| 040 | inventory_movements | 재고 이동 이력 테이블 |
| 041 | generate_inventory_items_optional_receiving | 재고 아이템 생성 RPC 보완 |
| 042 | system_settings | 시스템 설정 테이블 |
| 043 | inventory_items_cascade_delete | 재고 아이템 CASCADE |
| 044 | inbound_shipments | 수입 선적 (B/L, 컨테이너) |
| 045 | purchase_orders | 구매 발주 (사입) |
| 046 | companies_boolean_flags | 업체 플래그 |
| 047 | companies_country | 업체 국가 |
| 048 | warehouses | 창고 |
| 049 | warehouse_inventory | 창고별 재고 |
| 050 | profit_loss | 손익 |
| 051 | pl_statements | 손익계산서 |
| 052 | workspaces | 워크스페이스 (멀티테넌시) |
| 053 | workspace_id_rollout | 전 테이블 workspace_id 롤아웃 |
| 054 | rls_tenant_isolation | 테넌트 격리 RLS |
| 055 | workspace_id_not_null | workspace_id NOT NULL |
| 056 | rpc_workspace_id | RPC 워크스페이스 스코핑 |
| 057 | crm_generalize | CRM 일반화 |
| 058 | crm_pipeline | 영업 파이프라인 (deals, deal_stages) |
| 059 | create_workspace_rpc | 워크스페이스 생성 RPC |
| 060 | chat_core | 채팅 코어 (channels, messages, message_mentions) |
| 061 | chat_reactions_read | 이모지 반응 + 읽음 처리 |
| 062 | chat_dm_members | DM + 워크스페이스 멤버 RPC |
| 063 | chat_dm_rls_hardening | DM RLS 강화 |
| 064 | set_workspace_module | 모듈 토글 RPC |
| 065 | auth_user_helpers | auth 유저 헬퍼 |
| 066 | my_mentions | 내 멘션 알림 RPC |
| 067 | chat_attachments | 채팅 파일 첨부 |
| 068 | workspace_members_department | 멤버 부서 |
| 069 | logistics_module | 물류 모듈 게이팅 |
| 070 | record_threads | 레코드 스레드 + ERP 봇 시스템 메시지 + 인박스 RPC |

**다음 마이그레이션:** `071_xxx.sql`
