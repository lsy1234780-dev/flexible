-- 발주 요청사항 컬럼 추가
ALTER TABLE orders ADD COLUMN notes text;

-- RPC 재생성: p_notes 파라미터 추가
CREATE OR REPLACE FUNCTION create_order_with_stock_deduction(
  p_company_id uuid,
  p_items      jsonb,
  p_notes      text DEFAULT NULL
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
  -- 재고 확인 (차감은 확정 시 수행)
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

  -- 발주 생성
  INSERT INTO orders (company_id, status, notes)
  VALUES (p_company_id, 'pending', p_notes)
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
