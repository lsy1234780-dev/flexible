-- ============================================
-- 8차: 발주 흐름 재설계
--   1. quotations.order_id 추가 (어드민이 발주 보고 견적 생성)
--   2. 원자적 재고차감 RPC (발주 신청 즉시 base_stock 차감)
-- ============================================

-- quotations 에 order_id 연결
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_order ON quotations(order_id)
  WHERE order_id IS NOT NULL;

-- -------------------------------------------------------
-- RPC: 발주 생성 + 재고 원자적 차감
--   호출: supabase.rpc('create_order_with_stock_deduction', { p_company_id, p_items })
--   p_items: [{ product_id, quantity, unit_price }]
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION create_order_with_stock_deduction(
  p_company_id uuid,
  p_items      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id    uuid;
  v_item        jsonb;
  v_stock       integer;
  v_prod_name   text;
BEGIN
  -- 각 품목 재고 확인 및 차감 (FOR UPDATE 로 동시성 잠금)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT base_stock, name
      INTO v_stock, v_prod_name
      FROM products
     WHERE id = (v_item->>'product_id')::uuid
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND:%', v_item->>'product_id';
    END IF;

    IF v_stock < (v_item->>'quantity')::integer THEN
      RAISE EXCEPTION 'STOCK_ERROR:%:% (가용 %개)',
        v_prod_name,
        v_item->>'product_id',
        v_stock;
    END IF;

    UPDATE products
       SET base_stock = base_stock - (v_item->>'quantity')::integer
     WHERE id = (v_item->>'product_id')::uuid;
  END LOOP;

  -- 발주 헤더 생성
  INSERT INTO orders (company_id, status)
  VALUES (p_company_id, 'pending')
  RETURNING id INTO v_order_id;

  -- 발주 라인 아이템 생성
  INSERT INTO order_items (order_id, product_id, quantity, unit_price)
  SELECT v_order_id,
         (item->>'product_id')::uuid,
         (item->>'quantity')::integer,
         (item->>'unit_price')::numeric
    FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object('order_id', v_order_id);
END;
$$;

-- -------------------------------------------------------
-- RPC: 발주 취소 시 재고 복원
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION restore_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products p
     SET base_stock = p.base_stock + oi.quantity
    FROM order_items oi
   WHERE oi.order_id = p_order_id
     AND oi.product_id = p.id;
END;
$$;
