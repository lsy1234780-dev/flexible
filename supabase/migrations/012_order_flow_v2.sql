-- ============================================
-- 12차: 발주 흐름 v2
--   - 발주 생성 시 재고 차감 안 함 (pending 상태)
--   - 어드민 확정 시 원자적 재고 차감 (confirmed)
--   - shipments 테이블
--   - crm_logs 테이블
--   - cancelled 상태 추가
-- ============================================

-- 1. orders 상태에 cancelled 추가
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'shipped', 'completed', 'cancelled'));

-- 2. shipments 테이블
CREATE TABLE IF NOT EXISTS shipments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES orders(id),
  status       text NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')) DEFAULT 'pending',
  shipped_at   timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipments_read_all" ON shipments FOR SELECT USING (true);
CREATE POLICY "shipments_admin_all" ON shipments FOR ALL USING (true);

-- 3. crm_logs 테이블
CREATE TABLE IF NOT EXISTS crm_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  order_id    uuid REFERENCES orders(id),
  action      text NOT NULL,
  memo        text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_logs_read_all" ON crm_logs FOR SELECT USING (true);
CREATE POLICY "crm_logs_admin_all" ON crm_logs FOR ALL USING (true);

-- 4. 발주 확정 + 재고 차감 RPC (어드민 전용)
CREATE OR REPLACE FUNCTION confirm_order_with_stock_deduction(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status   text;
  v_item     record;
  v_stock    integer;
  v_prod_name text;
BEGIN
  -- 주문 상태 확인
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'INVALID_STATUS:현재 상태(%)에서는 확정할 수 없습니다', v_status;
  END IF;

  -- 각 품목 재고 확인 및 차감
  FOR v_item IN
    SELECT oi.product_id, oi.quantity
      FROM order_items oi
     WHERE oi.order_id = p_order_id
  LOOP
    SELECT base_stock, name
      INTO v_stock, v_prod_name
      FROM products
     WHERE id = v_item.product_id
       FOR UPDATE;

    IF v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'STOCK_ERROR:% (가용 %개, 요청 %개)',
        v_prod_name, v_stock, v_item.quantity;
    END IF;

    UPDATE products
       SET base_stock = base_stock - v_item.quantity
     WHERE id = v_item.product_id;
  END LOOP;

  -- 상태 업데이트
  UPDATE orders
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = p_order_id;
END;
$$;

-- 5. 발주 취소 + 재고 복원 RPC (confirmed 상태에서만 복원)
CREATE OR REPLACE FUNCTION cancel_order_with_stock_restore(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- confirmed 상태에서 취소 시 재고 복원
  IF v_status = 'confirmed' THEN
    UPDATE products p
       SET base_stock = p.base_stock + oi.quantity
      FROM order_items oi
     WHERE oi.order_id = p_order_id
       AND oi.product_id = p.id;
  END IF;

  -- pending 또는 confirmed만 취소 가능
  IF v_status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_STATUS:현재 상태(%)에서는 취소할 수 없습니다', v_status;
  END IF;

  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;

-- 6. 기존 create_order_with_stock_deduction 를 재고 차감 없는 버전으로 교체
CREATE OR REPLACE FUNCTION create_order_with_stock_deduction(
  p_company_id uuid,
  p_items      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
  v_stock    integer;
  v_prod_name text;
BEGIN
  -- 재고 '확인만' (차감 안 함) — 차감은 확정 시 수행
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT base_stock, name
      INTO v_stock, v_prod_name
      FROM products
     WHERE id = (v_item->>'product_id')::uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND:%', v_item->>'product_id';
    END IF;

    IF v_stock < (v_item->>'quantity')::integer THEN
      RAISE EXCEPTION 'STOCK_ERROR:%:% (가용 %개)',
        v_prod_name, v_item->>'product_id', v_stock;
    END IF;
  END LOOP;

  -- 발주 생성 (재고 차감 없이)
  INSERT INTO orders (company_id, status)
  VALUES (p_company_id, 'pending')
  RETURNING id INTO v_order_id;

  INSERT INTO order_items (order_id, product_id, quantity, unit_price)
  SELECT v_order_id,
         (item->>'product_id')::uuid,
         (item->>'quantity')::integer,
         (item->>'unit_price')::numeric
    FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object('order_id', v_order_id);
END;
$$;
