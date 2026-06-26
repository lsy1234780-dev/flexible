# AI Agent 연동 설계

## 목표

ERP 시스템 데이터를 AI Agent가 분석할 수 있는 구조로 설계합니다.

예시 활용:
- 일자별 판매량 분석 → 부진상품 알림
- 불량률 + CRM/A/S 접수 데이터 → 제품 보완점 분석
- 업체별 구매 패턴 → 영업 기회 발굴
- 재고 회전율 → 발주 타이밍 제안

---

## 아키텍처

```
사용자 질문 (자연어)
    ↓
AI Agent (Claude API)
    ↓
도구 선택
    ├── /api/agent/tools/* 호출    ← 읽기 전용 API
    ├── Supabase View 조회         ← 미리 만들어둔 분석용 뷰
    └── erp-metadata.yaml 참조    ← 비즈니스 맥락
    ↓
분석 결과 반환
```

> Agent가 직접 DB에 SQL을 날리지 않습니다.
> 목적별 읽기 전용 API 레이어를 통해 접근합니다.

---

## 필요한 3가지 레이어

### 1. 메타데이터 (`docs/schema/erp-metadata.yaml`)

테이블/컬럼에 비즈니스 의미를 부여합니다. Agent가 데이터를 해석하는 사전 역할.

```yaml
tables:
  orders:
    description: "고객 발주. status=confirmed 이후부터 실매출로 집계"
    business_rules:
      - "pending은 매출 미확정, 분석에서 제외"
      - "cancelled는 취소율 분석에만 포함"
    columns:
      confirmed_at:
        description: "매출 인식 기준 시점"

  as_requests:
    description: "A/S 요청. 제품 불량률 분석의 핵심 데이터 소스"
    business_rules:
      - "defective_parts[]로 고장 부위별 통계 가능"
      - "repair_cost로 수리 비용 분석 가능"
```

### 2. 분석용 View (Supabase)

Agent가 매번 복잡한 JOIN을 짜지 않도록 미리 만들어두는 뷰.

```sql
-- 부진상품 분석
CREATE VIEW v_product_sales_summary AS
SELECT
  p.id, p.name, p.category_id,
  COUNT(oi.id) as total_orders,
  SUM(oi.quantity) as total_qty_sold,
  MAX(o.confirmed_at) as last_sold_at,
  CURRENT_DATE - MAX(o.confirmed_at)::date as days_since_last_sale
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'confirmed'
GROUP BY p.id;

-- A/S 불량률
CREATE VIEW v_product_defect_summary AS
SELECT
  p.id as product_id, p.name,
  COUNT(ar.id) as total_as_requests,
  ar.defective_parts,
  AVG(ar.repair_cost) as avg_repair_cost
FROM products p
JOIN as_requests ar ON ar.product_id = p.id
GROUP BY p.id, p.name, ar.defective_parts;
```

### 3. Agent 전용 API (`/api/agent/tools/`)

```
GET /api/agent/tools/slow-moving-products?days=30
GET /api/agent/tools/high-defect-products?threshold=5
GET /api/agent/tools/company-purchase-pattern?company_id=xxx
GET /api/agent/tools/inventory-turnover?category=electronics
GET /api/agent/tools/as-trend?period=monthly
```

---

## inventory_ledger: 재고 변동 원장

현재 `inventory_logs`를 확장하여 **모든 재고 변동의 단일 진실 공급원**으로 만듭니다.

```sql
inventory_ledger (
  id uuid PRIMARY KEY,
  product_id uuid REFERENCES products(id),
  serial_id uuid,                    -- 시리얼 단위 추적 시
  warehouse_id uuid,                 -- 창고 위치 관리 시

  event_type text,
  -- 'purchase_in'  : 발주 입고
  -- 'sale_out'     : 판매 출고
  -- 'return_in'    : 반품 입고
  -- 'rma_out'      : RMA 반송
  -- 'adjustment'   : 재고 조정 (실사 등)
  -- 'transfer'     : 창고 간 이동
  -- 'refurb_in'    : 리퍼브 입고

  reference_type text,  -- 발생 도메인 (orders, as_requests, rma_requests 등)
  reference_id uuid,    -- 해당 레코드 id

  quantity_delta integer,   -- +입고 / -출고
  before_qty integer,
  after_qty integer,

  occurred_at timestamptz DEFAULT now(),
  created_by uuid
)
```

### 설계 원칙

- 모든 도메인(입고, 출고, 반품, RMA, 조정)에서 재고가 변할 때 ledger에 기록
- `reference_type + reference_id`로 어떤 트랜잭션에서 발생했는지 역추적 가능
- AI Agent는 이 테이블 하나만 분석하면 전체 재고 흐름 파악 가능

---

## 지금 해야 할 것 vs 나중에

### 지금 (설계 단계에서 확정)

- **이력 로그를 빠짐없이 남기는 구조** — 새 기능 추가 시 항상 로그 테이블 동반
- **status 값들의 의미를 명확하게 정의** — 메타데이터에 기록
- **날짜 컬럼 충분히 추가** — created_at, updated_at, confirmed_at 등

### 나중에 (기능 완성 후)

- 분석용 View 생성
- Agent API 엔드포인트 구축
- erp-metadata.yaml 완성
- inventory_ledger 마이그레이션 + 기존 로그 이관
