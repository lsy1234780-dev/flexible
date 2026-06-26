-- 039: product_serials → inventory_items 구조 전환
-- 재고 로우가 주체, 시리얼은 부가 컬럼 (nullable)
-- serial_mode='none' 제품도 동일 테이블로 재고 관리

-- ═══ STEP 1: 테이블 리네임 (FK 자동 유지) ═══
ALTER TABLE product_serials RENAME TO inventory_items;

-- ═══ STEP 2: 컬럼 추가/변경 ═══
-- location 컬럼 (향후 위치 관리용)
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS location text;

-- status 확장: 'receiving' 상태 추가
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS product_serials_status_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_status_check
  CHECK (status IN ('receiving', 'in_stock', 'reserved', 'shipped', 'sold', 'disposed'));

-- serial_number nullable (serial_mode='none' 제품용)
ALTER TABLE inventory_items ALTER COLUMN serial_number DROP NOT NULL;

-- UNIQUE(product_id, serial_number) → partial unique (NULL 허용)
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS product_serials_product_id_serial_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_product_serial_unique
  ON inventory_items (product_id, serial_number)
  WHERE serial_number IS NOT NULL;

-- ═══ STEP 3: 인덱스 리네임 ═══
ALTER INDEX IF EXISTS idx_product_serials_product RENAME TO idx_inventory_items_product;
ALTER INDEX IF EXISTS idx_product_serials_status RENAME TO idx_inventory_items_status;
ALTER INDEX IF EXISTS idx_product_serials_barcode RENAME TO idx_inventory_items_barcode;
ALTER INDEX IF EXISTS idx_product_serials_lot RENAME TO idx_inventory_items_lot;
ALTER INDEX IF EXISTS idx_product_serials_staging RENAME TO idx_inventory_items_staging;
ALTER INDEX IF EXISTS idx_product_serials_manufacturer RENAME TO idx_inventory_items_manufacturer;
ALTER INDEX IF EXISTS product_serials_unit_barcode_unique RENAME TO inventory_items_unit_barcode_unique;

-- location 인덱스
CREATE INDEX IF NOT EXISTS idx_inventory_items_location
  ON inventory_items(location) WHERE location IS NOT NULL;

-- ═══ STEP 4: shipment_serials 컬럼 리네임 ═══
ALTER TABLE shipment_serials RENAME COLUMN serial_id TO inventory_item_id;
ALTER INDEX IF EXISTS idx_shipment_serials_serial RENAME TO idx_shipment_serials_inventory_item;

-- ═══ STEP 5: RLS 정책 재생성 ═══
DROP POLICY IF EXISTS "service_role_all" ON inventory_items;
CREATE POLICY "inventory_items_all" ON inventory_items FOR ALL USING (true) WITH CHECK (true);

-- ═══ STEP 6: RPC 재생성 ═══
-- 기존 함수 삭제
DROP FUNCTION IF EXISTS generate_product_serials(uuid, integer, uuid, uuid, boolean);

-- 새 함수: generate_inventory_items
CREATE OR REPLACE FUNCTION generate_inventory_items(
  p_product_id uuid,
  p_quantity integer,
  p_receiving_item_id uuid,
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

-- 하위호환 래퍼 (전환기간 중 기존 코드 안전)
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
BEGIN
  RETURN QUERY
  SELECT gi.item_id AS serial_id, gi.unit_barcode, gi.serial_number
  FROM generate_inventory_items(p_product_id, p_quantity, p_receiving_item_id, p_lot_id, p_generate_unit_barcode) gi;
END;
$$;
