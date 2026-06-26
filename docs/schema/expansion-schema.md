# 확장 예정 스키마

> 이 문서는 아직 구현되지 않은 미래 확장 테이블의 설계 초안입니다.
> 실제 마이그레이션 작성 시 이 문서를 참고하되, 당시 상황에 맞게 조정하세요.

---

## 1. products 확장 컬럼

```sql
ALTER TABLE products ADD COLUMN serial_mode text
  CHECK (serial_mode IN ('none', 'pool', 'strict'))
  DEFAULT 'none';

ALTER TABLE products ADD COLUMN product_type text
  CHECK (product_type IN ('new', 'refurb', 'parts'))
  DEFAULT 'new';

ALTER TABLE products ADD COLUMN cost_price numeric;        -- 원가
ALTER TABLE products ADD COLUMN hs_code text;              -- 관세 HS코드
ALTER TABLE products ADD COLUMN manufacturer_id uuid
  REFERENCES companies(id);
ALTER TABLE products ADD COLUMN country_of_origin text;
ALTER TABLE products ADD COLUMN warranty_months integer;
```

---

## 2. companies.type 확장

```sql
-- 현재: 'admin' | 'b2b'
-- 확장: + 'supplier' | 'manufacturer' | 'consignment' | 'logistics_partner'

ALTER TABLE companies DROP CONSTRAINT companies_type_check;
ALTER TABLE companies ADD CONSTRAINT companies_type_check
  CHECK (type IN (
    'admin', 'b2b', 'supplier', 'manufacturer',
    'consignment', 'logistics_partner'
  ));

ALTER TABLE companies ADD COLUMN country text;
ALTER TABLE companies ADD COLUMN tax_id text;   -- 사업자번호
```

---

## 3. Supply Chain (발주추적 + 입고 + RMA)

### purchase_orders (구매발주)

```sql
purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  supplier_id uuid REFERENCES companies(id),
  status text CHECK (status IN (
    'draft', 'sent', 'confirmed', 'partial', 'completed', 'cancelled'
  )) DEFAULT 'draft',
  currency text DEFAULT 'KRW',
  exchange_rate numeric,
  ordered_at timestamptz,
  expected_at date,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now()
)

purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  ordered_qty integer NOT NULL,
  confirmed_qty integer DEFAULT 0,
  received_qty integer DEFAULT 0,
  unit_cost numeric NOT NULL,
  total_cost numeric GENERATED ALWAYS AS (ordered_qty * unit_cost) STORED
)
```

### inbound_shipments (선적/운송)

```sql
inbound_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id),
  transport_mode text CHECK (transport_mode IN ('air', 'sea', 'land')),
  carrier text,
  tracking_number text,
  awb_number text,                  -- 항공화물번호
  bl_number text,                   -- 선하증권 번호
  vessel_name text,
  origin_country text,

  customs_status text CHECK (customs_status IN (
    'pending', 'in_review', 'cleared', 'held'
  )) DEFAULT 'pending',
  customs_cleared_at timestamptz,
  declared_value numeric,

  departed_at timestamptz,
  estimated_arrival date,
  arrived_at timestamptz,
  status text CHECK (status IN (
    'in_transit', 'customs', 'arrived', 'receiving', 'completed'
  )) DEFAULT 'in_transit',
  created_at timestamptz DEFAULT now()
)

inbound_shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES inbound_shipments(id) ON DELETE CASCADE,
  po_item_id uuid REFERENCES purchase_order_items(id),
  product_id uuid REFERENCES products(id),
  expected_qty integer NOT NULL,
  received_qty integer DEFAULT 0,
  loss_qty integer DEFAULT 0,
  defective_qty integer DEFAULT 0,
  notes text
)
```

### rma_requests (RMA - 본사 불량 반품)

```sql
rma_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_number text UNIQUE NOT NULL,
  supplier_id uuid REFERENCES companies(id),
  type text CHECK (type IN ('defective', 'loss_claim', 'warranty')),
  status text CHECK (status IN (
    'draft', 'submitted', 'approved', 'shipped', 'credited'
  )) DEFAULT 'draft',
  submitted_at timestamptz,
  approved_at timestamptz,
  credit_amount numeric,
  credit_type text CHECK (credit_type IN ('refund', 'replacement', 'credit_note')),
  created_at timestamptz DEFAULT now()
)

rma_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_id uuid REFERENCES rma_requests(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  serial_id uuid REFERENCES product_serials(id),
  quantity integer NOT NULL,
  unit_cost numeric,
  defect_description text,
  evidence_url text
)
```

---

## 4. CRM 확장 (교환/반품)

### crm_tickets (통합 접수)

```sql
crm_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,
  company_id uuid REFERENCES companies(id),
  customer_ref text,                -- 마스킹된 고객 식별자 (시스템 A)
  serial_id uuid REFERENCES product_serials(id),
  product_id uuid REFERENCES products(id),
  type text CHECK (type IN (
    'exchange', 'return', 'repair', 'inquiry', 'complaint'
  )),
  channel text CHECK (channel IN ('email', 'phone', 'portal', 'walk_in')),
  status text CHECK (status IN (
    'open', 'in_progress', 'pending_parts', 'resolved', 'closed'
  )) DEFAULT 'open',
  issue_description text NOT NULL,
  resolution text,
  assigned_to uuid REFERENCES auth.users(id),
  opened_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
)
```

### return_orders (교환/반품 처리)

```sql
return_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES crm_tickets(id),
  order_id uuid REFERENCES orders(id),
  type text CHECK (type IN ('return', 'exchange')),
  reason text CHECK (reason IN (
    'defective', 'wrong_item', 'change_of_mind', 'damaged'
  )),
  status text CHECK (status IN (
    'requested', 'approved', 'received', 'inspected', 'completed'
  )) DEFAULT 'requested',
  return_warehouse_id uuid,
  received_at timestamptz,
  inspected_at timestamptz,
  inspection_result text CHECK (inspection_result IN (
    'resalable', 'refurb', 'defective', 'scrap'
  )),
  refund_amount numeric,
  exchange_product_id uuid REFERENCES products(id),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
)
```

---

## 5. Settlement (정산)

### settlement_periods (정산 기간)

```sql
settlement_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  type text CHECK (type IN ('consignment', 'channel', 'b2b')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text CHECK (status IN (
    'open', 'calculating', 'confirmed', 'paid'
  )) DEFAULT 'open',
  gross_sales numeric DEFAULT 0,
  returns_amount numeric DEFAULT 0,
  commission_rate numeric,
  commission_amount numeric DEFAULT 0,
  net_payable numeric DEFAULT 0,
  settled_at timestamptz,
  created_at timestamptz DEFAULT now()
)

settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid REFERENCES settlement_periods(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id),
  product_id uuid REFERENCES products(id),
  quantity integer,
  unit_price numeric,
  return_quantity integer DEFAULT 0,
  line_total numeric
)
```

---

## 6. Refurb (리퍼브)

```sql
refurb_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_order_id uuid REFERENCES return_orders(id),
  serial_id uuid REFERENCES product_serials(id),
  product_id uuid REFERENCES products(id),
  grade text CHECK (grade IN ('A', 'B', 'C', 'scrap')),
  defects jsonb,                -- [{part, description, severity}]
  repair_cost numeric,
  assessed_by uuid,
  assessed_at timestamptz DEFAULT now()
)

refurb_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_product_id uuid REFERENCES products(id),
  serial_id uuid REFERENCES product_serials(id),
  assessment_id uuid REFERENCES refurb_assessments(id),
  grade text,
  refurb_price numeric,
  refurb_cost numeric,
  status text CHECK (status IN (
    'processing', 'available', 'sold', 'scrapped'
  )) DEFAULT 'processing',
  listed_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz DEFAULT now()
)
```

---

## 7. Analytics Layer

### inventory_ledger (재고 변동 원장)

```sql
inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  serial_id uuid REFERENCES product_serials(id),
  warehouse_id uuid,

  event_type text NOT NULL,
  -- 'purchase_in', 'sale_out', 'return_in',
  -- 'rma_out', 'adjustment', 'transfer', 'refurb_in'

  reference_type text,    -- 'orders', 'as_requests', 'rma_requests' 등
  reference_id uuid,

  quantity_delta integer NOT NULL,   -- +입고 / -출고
  before_qty integer,
  after_qty integer,

  occurred_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
)

CREATE INDEX idx_ledger_product ON inventory_ledger(product_id);
CREATE INDEX idx_ledger_event ON inventory_ledger(event_type);
CREATE INDEX idx_ledger_ref ON inventory_ledger(reference_type, reference_id);
```

### 추가 로그 테이블

```sql
-- 가격 변경 이력
price_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  company_id uuid REFERENCES companies(id),   -- null이면 base_price 변경
  old_price numeric,
  new_price numeric,
  changed_at timestamptz DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id)
)

-- 재고 조정 이력
stock_adjustment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  before_qty integer,
  after_qty integer,
  reason text,
  adjusted_at timestamptz DEFAULT now(),
  adjusted_by uuid REFERENCES auth.users(id)
)
```
