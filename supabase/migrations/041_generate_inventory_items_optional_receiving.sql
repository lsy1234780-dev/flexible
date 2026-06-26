-- 041: generate_inventory_items - receiving_item_id 선택적으로 변경
-- 바코드 수동 입고 시 receiving_item_id 없이 inventory_items 생성 가능

DROP FUNCTION IF EXISTS generate_inventory_items(uuid, integer, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION generate_inventory_items(
  p_product_id uuid,
  p_quantity integer,
  p_receiving_item_id uuid DEFAULT NULL,
  p_lot_id uuid DEFAULT NULL,
  p_generate_unit_barcode boolean DEFAULT TRUE
)
RETURNS TABLE(item_id uuid, unit_barcode text, serial_number integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_base_barcode text;
  v_serial_mode text;
  v_next_serial integer;
  v_i integer;
  v_unit_barcode text;
  v_item_id uuid;
BEGIN
  -- 제품 바코드 및 serial_mode 조회
  SELECT barcode, serial_mode INTO v_base_barcode, v_serial_mode
  FROM products WHERE id = p_product_id;

  IF v_base_barcode IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND: 제품을 찾을 수 없습니다';
  END IF;

  -- serial_mode='none': serial_number 없이 생성
  IF v_serial_mode = 'none' THEN
    FOR v_i IN 1..p_quantity LOOP
      v_item_id := gen_random_uuid();

      INSERT INTO inventory_items (id, product_id, serial_number, unit_barcode, receiving_item_id, lot_id, status)
      VALUES (v_item_id, p_product_id, NULL, NULL, p_receiving_item_id, p_lot_id, 'in_stock');

      item_id := v_item_id;
      unit_barcode := NULL;
      serial_number := NULL;
      RETURN NEXT;
    END LOOP;
    RETURN;
  END IF;

  -- pool/strict: 기존 로직 (serial_number 자동 채번)
  SELECT COALESCE(MAX(sub.serial_number), 0)
  INTO v_next_serial
  FROM (
    SELECT ii.serial_number
    FROM inventory_items ii
    WHERE ii.product_id = p_product_id
      AND ii.serial_number IS NOT NULL
    FOR UPDATE
  ) sub;

  FOR v_i IN 1..p_quantity LOOP
    v_next_serial := v_next_serial + 1;

    IF p_generate_unit_barcode THEN
      v_unit_barcode := v_base_barcode || '-' || LPAD(v_next_serial::text, 4, '0');
    ELSE
      v_unit_barcode := NULL;
    END IF;

    v_item_id := gen_random_uuid();

    INSERT INTO inventory_items (id, product_id, serial_number, unit_barcode, receiving_item_id, lot_id, status)
    VALUES (v_item_id, p_product_id, v_next_serial, v_unit_barcode, p_receiving_item_id, p_lot_id, 'in_stock');

    item_id := v_item_id;
    unit_barcode := v_unit_barcode;
    serial_number := v_next_serial;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 하위호환 래퍼도 재생성 (동일 시그니처)
DROP FUNCTION IF EXISTS generate_product_serials(uuid, integer, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION generate_product_serials(
  p_product_id uuid,
  p_quantity integer,
  p_receiving_item_id uuid DEFAULT NULL,
  p_lot_id uuid DEFAULT NULL,
  p_generate_unit_barcode boolean DEFAULT TRUE
)
RETURNS TABLE(serial_id uuid, unit_barcode text, serial_number integer)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT gi.item_id AS serial_id, gi.unit_barcode, gi.serial_number
  FROM generate_inventory_items(p_product_id, p_quantity, p_receiving_item_id, p_lot_id, p_generate_unit_barcode) gi;
END;
$$;
