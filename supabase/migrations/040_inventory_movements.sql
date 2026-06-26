-- 040: inventory_movements (재고 이동 이력 테이블)
-- inventory_logs(aggregate)와 별도로, 개별 아이템 단위 이력 추적

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES products(id),
  from_status text,
  to_status text,
  from_location text,
  to_location text,
  quantity integer NOT NULL DEFAULT 1,
  reason text,          -- 입고확정, 위치이동, 출고예약, 출고완료, 상태변경 등
  memo text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_inventory_movements_item ON inventory_movements(inventory_item_id);
CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_created ON inventory_movements(created_at DESC);

-- RLS
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_movements_all" ON inventory_movements FOR ALL USING (true) WITH CHECK (true);
