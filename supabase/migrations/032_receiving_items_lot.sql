-- 032: receiving_items에 lot_id 컬럼 추가
-- 입고지시서 생성 시 어드민이 LOT을 지정하면, 스캔 시 자동 연결

ALTER TABLE receiving_items
  ADD COLUMN lot_id uuid REFERENCES product_lots(id) ON DELETE SET NULL;

CREATE INDEX idx_receiving_items_lot ON receiving_items(lot_id);
