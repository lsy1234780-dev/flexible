-- 031: generate_product_serials에 lot_id 파라미터 추가

CREATE OR REPLACE FUNCTION generate_product_serials(
  p_product_id uuid,
  p_quantity integer,
  p_receiving_item_id uuid,
  p_lot_id uuid DEFAULT NULL
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

    INSERT INTO product_serials (id, product_id, serial_number, serial_barcode, receiving_item_id, lot_id, status)
    VALUES (v_serial_id, p_product_id, v_next_serial, v_serial_barcode, p_receiving_item_id, p_lot_id, 'in_stock');

    serial_id := v_serial_id;
    serial_barcode := v_serial_barcode;
    serial_number := v_next_serial;
    RETURN NEXT;
  END LOOP;
END;
$$;
