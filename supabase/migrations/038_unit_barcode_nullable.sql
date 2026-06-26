-- 038: unit_barcode를 nullable로 변경 (개별 바코드 미생성 옵션)
-- 입고 확정 시 개별 바코드 생성 여부를 선택할 수 있도록

-- 1) unit_barcode nullable로 변경
ALTER TABLE product_serials ALTER COLUMN unit_barcode DROP NOT NULL;

-- 2) unique constraint를 partial unique index로 교체
-- 기존 unique constraint 삭제
ALTER TABLE product_serials DROP CONSTRAINT IF EXISTS product_serials_unit_barcode_key;

-- NULL이 아닌 값에 대해서만 unique
CREATE UNIQUE INDEX IF NOT EXISTS product_serials_unit_barcode_unique
  ON product_serials (unit_barcode)
  WHERE unit_barcode IS NOT NULL;

-- 3) RPC 업데이트: p_generate_unit_barcode 파라미터 추가
DROP FUNCTION IF EXISTS generate_product_serials(uuid, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION generate_product_serials(
  p_product_id uuid,
  p_quantity integer,
  p_receiving_item_id uuid,
  p_lot_id uuid DEFAULT NULL,
  p_generate_unit_barcode boolean DEFAULT TRUE
)
RETURNS TABLE(serial_id uuid, unit_barcode text, serial_number integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_base_barcode text;
  v_next_serial integer;
  v_i integer;
  v_unit_barcode text;
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

    -- unit_barcode 생성 여부에 따라 분기
    IF p_generate_unit_barcode THEN
      v_unit_barcode := v_base_barcode || '-' || LPAD(v_next_serial::text, 4, '0');
    ELSE
      v_unit_barcode := NULL;
    END IF;

    v_serial_id := gen_random_uuid();

    INSERT INTO product_serials (id, product_id, serial_number, unit_barcode, receiving_item_id, lot_id, status)
    VALUES (v_serial_id, p_product_id, v_next_serial, v_unit_barcode, p_receiving_item_id, p_lot_id, 'in_stock');

    serial_id := v_serial_id;
    unit_barcode := v_unit_barcode;
    serial_number := v_next_serial;
    RETURN NEXT;
  END LOOP;
END;
$$;
