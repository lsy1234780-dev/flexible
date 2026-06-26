-- 044: 입고 통합 관리 — inbound_shipments 파이프라인

-- ── inbound_shipments: 입고 건 (발주~입고완료 추적) ──
CREATE TABLE inbound_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'ordered',
  -- 공급처
  supplier text,
  supplier_contact text,
  -- 배송 정보
  bl_number text,
  container_number text,
  origin_country text,
  carrier text,
  tracking_number text,
  -- 일정
  estimated_arrival date,
  actual_arrival date,
  -- 결제 정보
  payment_method text,
  payment_status text DEFAULT 'unpaid',
  payment_amount numeric,
  payment_currency text DEFAULT 'KRW',
  payment_memo text,
  -- 입고지시서 연결
  receiving_order_id uuid REFERENCES receiving_orders(id) ON DELETE SET NULL,
  -- 메타
  memo text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── inbound_shipment_items: 입고 품목 ──
CREATE TABLE inbound_shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES inbound_shipments(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL DEFAULT 0,
  unit_cost numeric,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── inbound_shipment_events: 타임라인/이력 ──
CREATE TABLE inbound_shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES inbound_shipments(id) ON DELETE CASCADE,
  event_type text NOT NULL,      -- stage_change, memo, payment, document
  title text NOT NULL,
  description text,
  from_stage text,
  to_stage text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 인덱스 ──
CREATE INDEX idx_inbound_shipments_stage ON inbound_shipments(stage);
CREATE INDEX idx_inbound_shipments_created ON inbound_shipments(created_at DESC);
CREATE INDEX idx_inbound_shipment_items_shipment ON inbound_shipment_items(shipment_id);
CREATE INDEX idx_inbound_shipment_events_shipment ON inbound_shipment_events(shipment_id);

-- ── RLS (service role 패턴) ──
ALTER TABLE inbound_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbound_shipments_all" ON inbound_shipments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE inbound_shipment_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbound_shipment_items_all" ON inbound_shipment_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE inbound_shipment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbound_shipment_events_all" ON inbound_shipment_events FOR ALL USING (true) WITH CHECK (true);
