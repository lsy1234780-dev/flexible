-- 034: 바코드/시리얼 분리 설계
-- serial_barcode → unit_barcode 리네임 (바코드 ≠ 시리얼, 별개 개념)
-- products.serial_mode 추가 (none/pool/strict)

-- 1) products에 serial_mode 추가
ALTER TABLE products ADD COLUMN IF NOT EXISTS serial_mode text NOT NULL DEFAULT 'pool'
  CHECK (serial_mode IN ('none', 'pool', 'strict'));
-- none:   수량만 관리, 개별 시리얼 없음
-- pool:   자체 바코드 발급 (unit_barcode 자동생성)
-- strict: 제조사 시리얼 필수, unit_barcode는 제조사 바코드 또는 자체생성

-- 2) serial_barcode → unit_barcode 리네임
ALTER TABLE product_serials RENAME COLUMN serial_barcode TO unit_barcode;

-- 인덱스도 리네임 (기존 unique constraint 유지)
ALTER INDEX IF EXISTS product_serials_serial_barcode_key
  RENAME TO product_serials_unit_barcode_key;

-- 3) generate_product_serials RPC 업데이트 (리턴 타입 변경 시 DROP 필수)
DROP FUNCTION IF EXISTS generate_product_serials(uuid, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION generate_product_serials(
  p_product_id uuid,
  p_quantity integer,
  p_receiving_item_id uuid,
  p_lot_id uuid DEFAULT NULL
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
    v_unit_barcode := v_base_barcode || '-' || LPAD(v_next_serial::text, 4, '0');
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
