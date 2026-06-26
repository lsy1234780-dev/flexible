-- 043: inventory_items의 product_id FK에 ON DELETE CASCADE 추가
-- 제품 삭제 시 관련 inventory_items도 함께 삭제되도록 변경

-- 기존 FK 제거 (리네임 전 이름으로 남아있음)
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS product_serials_product_id_fkey;
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_product_id_fkey;

-- CASCADE FK 재생성
ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- inventory_movements도 inventory_items 삭제 시 함께 삭제
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_inventory_item_id_fkey;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_inventory_item_id_fkey
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;
