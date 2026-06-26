-- 033: 입고 확정 플로우 리팩토링
-- 물류 스캔 = 수량 카운트만, 어드민 확정 = 시리얼/LOT/재고 반영

-- 1) product_serials에 제조사 시리얼 컬럼 추가
ALTER TABLE product_serials ADD COLUMN IF NOT EXISTS manufacturer_serial text;
CREATE INDEX IF NOT EXISTS idx_product_serials_manufacturer
  ON product_serials(manufacturer_serial) WHERE manufacturer_serial IS NOT NULL;

-- 2) receiving_orders status에 'awaiting_confirmation' 추가
ALTER TABLE receiving_orders DROP CONSTRAINT IF EXISTS receiving_orders_status_check;
ALTER TABLE receiving_orders ADD CONSTRAINT receiving_orders_status_check
  CHECK (status IN ('pending', 'in_progress', 'awaiting_confirmation', 'completed', 'cancelled'));

-- 3) 확정 시점 기록
ALTER TABLE receiving_orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- 4) receiving_items.lot_id 제거 (032에서 추가했지만 LOT는 이제 확정 시점에 부여)
DROP INDEX IF EXISTS idx_receiving_items_lot;
ALTER TABLE receiving_items DROP COLUMN IF EXISTS lot_id;
