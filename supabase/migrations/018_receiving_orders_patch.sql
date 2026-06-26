-- 018: receiving_orders 패치 (017 이후 구조 변경분)

-- 입고지시서 제목
ALTER TABLE receiving_orders ADD COLUMN IF NOT EXISTS title text;

-- 어드민 작성자
ALTER TABLE receiving_orders ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- status 체크 제약 교체: 'pending' 추가
ALTER TABLE receiving_orders DROP CONSTRAINT IF EXISTS receiving_orders_status_check;
ALTER TABLE receiving_orders ADD CONSTRAINT receiving_orders_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));

-- receiving_items: expected_quantity NOT NULL + 기본값
ALTER TABLE receiving_items ALTER COLUMN expected_quantity SET NOT NULL;
ALTER TABLE receiving_items ALTER COLUMN expected_quantity SET DEFAULT 0;

-- receiving_items: 같은 지시서 내 제품 중복 방지
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receiving_items_receiving_order_id_product_id_key'
  ) THEN
    ALTER TABLE receiving_items ADD CONSTRAINT receiving_items_receiving_order_id_product_id_key
      UNIQUE (receiving_order_id, product_id);
  END IF;
END $$;
