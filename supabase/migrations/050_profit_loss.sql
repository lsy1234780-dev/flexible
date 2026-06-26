-- 050: 손익계산서 지원
-- products에 원가(cost_price) 컬럼 추가 (고정값)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0 CHECK (cost_price >= 0);

-- inventory_movements에 판매가(sale_price) 컬럼 추가 (출고 시 임의 기입)
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS sale_price numeric CHECK (sale_price >= 0);

-- inventory_logs에도 sale_price 추가 (집계 이력 보존)
ALTER TABLE inventory_logs
  ADD COLUMN IF NOT EXISTS sale_price numeric CHECK (sale_price >= 0);

-- 손익 집계 뷰: 출고된 inventory_movements 기준
CREATE OR REPLACE VIEW inventory_pl_view AS
SELECT
  im.id,
  im.created_at,
  im.product_id,
  p.name                                    AS product_name,
  p.barcode                                 AS product_barcode,
  p.cost_price,
  im.sale_price,
  im.quantity,
  (im.sale_price - p.cost_price) * im.quantity AS profit,
  im.reason,
  im.memo,
  im.to_status
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
WHERE im.sale_price IS NOT NULL
  AND im.to_status IN ('disposed', 'shipped', 'sold');

COMMENT ON VIEW inventory_pl_view IS '판매가가 기입된 출고 이동 기준 손익 집계 뷰';
