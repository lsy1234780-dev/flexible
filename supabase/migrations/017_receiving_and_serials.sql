-- 017: 입고 플로우 + 제품 시리얼 바코드 체계
-- 입고지시서 기반 입고 관리 + 개별 제품 고유 시리얼 바코드

-- ── 입고지시서 (어드민이 생성, 나중에 발주(PO)에서 자동 생성) ──
CREATE TABLE IF NOT EXISTS receiving_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid,               -- 나중에 발주(PO)와 연동
  title text,                            -- 입고지시서 제목 (예: "3월 2차 입고")
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  memo text,
  created_by uuid REFERENCES auth.users(id),  -- 어드민 작성자
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- ── 입고지시서 항목 (제품별 예상 수량 + 실입고 수량) ──
CREATE TABLE IF NOT EXISTS receiving_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_order_id uuid NOT NULL REFERENCES receiving_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  expected_quantity integer NOT NULL DEFAULT 0,   -- 지시 수량
  received_quantity integer NOT NULL DEFAULT 0,   -- 확정 입고 수량
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(receiving_order_id, product_id)
);

-- ── 제품 개별 시리얼 (핵심) ──
-- 바코드 형식: {base_barcode}-{4자리 일련번호}  예) 8800000001-0001
CREATE TABLE IF NOT EXISTS product_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  serial_number integer NOT NULL,                      -- 제품 내 일련번호 (1, 2, 3...)
  serial_barcode text NOT NULL UNIQUE,                 -- 완성된 고유 바코드
  receiving_item_id uuid REFERENCES receiving_items(id), -- 어떤 입고항목에서 생성됐는지
  status text NOT NULL DEFAULT 'in_stock'
    CHECK (status IN ('in_stock', 'reserved', 'shipped', 'sold', 'disposed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, serial_number)
);

-- ── 인덱스 ──
CREATE INDEX IF NOT EXISTS idx_product_serials_product ON product_serials(product_id);
CREATE INDEX IF NOT EXISTS idx_product_serials_status ON product_serials(status);
CREATE INDEX IF NOT EXISTS idx_product_serials_barcode ON product_serials(serial_barcode);
CREATE INDEX IF NOT EXISTS idx_receiving_items_order ON receiving_items(receiving_order_id);
CREATE INDEX IF NOT EXISTS idx_receiving_orders_status ON receiving_orders(status);

-- ── 시리얼 번호 자동 채번 함수 ──
-- 제품별로 다음 일련번호를 구해 시리얼 바코드를 생성
CREATE OR REPLACE FUNCTION generate_product_serials(
  p_product_id uuid,
  p_quantity integer,
  p_receiving_item_id uuid
)
RETURNS TABLE(serial_id uuid, serial_barcode text, serial_number integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_base_barcode text;
  v_next_serial integer;
  v_i integer;
  v_serial_barcode text;
  v_serial_id uuid;
BEGIN
  -- 제품 바코드 조회
  SELECT barcode INTO v_base_barcode
  FROM products WHERE id = p_product_id;

  IF v_base_barcode IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND: 제품을 찾을 수 없습니다';
  END IF;

  -- 현재 최대 일련번호 조회 (서브쿼리로 FOR UPDATE 동시성 제어)
  SELECT COALESCE(MAX(sub.serial_number), 0)
  INTO v_next_serial
  FROM (
    SELECT ps.serial_number
    FROM product_serials ps
    WHERE ps.product_id = p_product_id
    FOR UPDATE
  ) sub;

  -- 수량만큼 시리얼 생성
  FOR v_i IN 1..p_quantity LOOP
    v_next_serial := v_next_serial + 1;
    v_serial_barcode := v_base_barcode || '-' || LPAD(v_next_serial::text, 4, '0');
    v_serial_id := gen_random_uuid();

    INSERT INTO product_serials (id, product_id, serial_number, serial_barcode, receiving_item_id, status)
    VALUES (v_serial_id, p_product_id, v_next_serial, v_serial_barcode, p_receiving_item_id, 'in_stock');

    serial_id := v_serial_id;
    serial_barcode := v_serial_barcode;
    serial_number := v_next_serial;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ── RLS ──
ALTER TABLE receiving_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE receiving_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_serials ENABLE ROW LEVEL SECURITY;

-- service_role은 모든 접근 가능 (어드민/물류 서버 액션에서 사용)
CREATE POLICY "service_role_all" ON receiving_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON receiving_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON product_serials FOR ALL USING (true) WITH CHECK (true);
