-- 045: 발주/결제/운송 분리
-- 구조: purchase_orders 1:N inbound_shipments N:1 receiving_orders
--       purchase_orders 1:N purchase_order_payments (결제 이력)

-- ── purchase_orders: 발주 ──
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text,                         -- 발주번호 (자동생성 또는 수동)
  title text NOT NULL,
  -- 공급처
  supplier text,
  supplier_contact text,
  -- 금액
  total_amount numeric,                   -- 발주 총액
  currency text DEFAULT 'KRW',
  exchange_rate numeric,                  -- 환율 (외화 시)
  vat_amount numeric,                     -- 부가세
  -- 결제 상태 (payments 합산으로 자동 판정, 캐시 용도)
  payment_status text DEFAULT 'unpaid',   -- unpaid, partial, paid
  -- 메타
  memo text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── purchase_order_items: 발주 품목 ──
CREATE TABLE purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL DEFAULT 0,
  unit_cost numeric,                      -- 매입 단가
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── purchase_order_payments: 결제 이력 ──
CREATE TABLE purchase_order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL,                -- 결제 금액
  currency text DEFAULT 'KRW',
  method text,                            -- T/T, L/C, 카드, 현금 등
  paid_at date NOT NULL,                  -- 결제일
  label text,                             -- "계약금 30%", "선적 전 잔금" 등
  memo text,
  attachment_url text,                    -- 영수증/송금확인서 (Supabase Storage)
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── inbound_shipments 변경: 발주 연결 + 운송 세부 추가 + 발주 컬럼 제거 ──

-- 발주 FK
ALTER TABLE inbound_shipments
  ADD COLUMN purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- 운송 타입
ALTER TABLE inbound_shipments
  ADD COLUMN shipping_type text;  -- sea, air, domestic

-- 통관
ALTER TABLE inbound_shipments
  ADD COLUMN customs_status text DEFAULT 'pending';  -- pending, in_progress, cleared, exempt
ALTER TABLE inbound_shipments
  ADD COLUMN customs_amount numeric;
ALTER TABLE inbound_shipments
  ADD COLUMN customs_cleared_at date;

-- 배차번호 (국내 운송)
ALTER TABLE inbound_shipments
  ADD COLUMN vehicle_number text;

-- 발주 쪽으로 이관된 컬럼 제거
ALTER TABLE inbound_shipments
  DROP COLUMN IF EXISTS supplier,
  DROP COLUMN IF EXISTS supplier_contact,
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS payment_status,
  DROP COLUMN IF EXISTS payment_amount,
  DROP COLUMN IF EXISTS payment_currency,
  DROP COLUMN IF EXISTS payment_memo;

-- ── 인덱스 ──
CREATE INDEX idx_purchase_orders_created ON purchase_orders(created_at DESC);
CREATE INDEX idx_purchase_order_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_purchase_order_payments_po ON purchase_order_payments(purchase_order_id);
CREATE INDEX idx_inbound_shipments_po ON inbound_shipments(purchase_order_id);

-- ── RLS ──
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_orders_all" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_order_items_all" ON purchase_order_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE purchase_order_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_order_payments_all" ON purchase_order_payments FOR ALL USING (true) WITH CHECK (true);
