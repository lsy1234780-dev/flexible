-- 견적서 항목 확장: 커스텀 항목(기타비용/할인), 항목별 과세 여부
-- product_id를 nullable로 변경 (커스텀 항목은 product 없이 label만)
-- label 컬럼 추가 (커스텀 항목명: 수리비, 출장비, 할인 등)
-- is_taxable 컬럼 추가 (항목별 부가세 적용 여부)
-- unit_price 음수 허용 (할인 항목)

-- 1. product_id NOT NULL 제약 제거
ALTER TABLE quotation_items ALTER COLUMN product_id DROP NOT NULL;

-- 2. label 컬럼 추가
ALTER TABLE quotation_items ADD COLUMN label text;

-- 3. is_taxable 컬럼 추가
ALTER TABLE quotation_items ADD COLUMN is_taxable boolean NOT NULL DEFAULT true;

-- 4. unit_price >= 0 제약 제거 (할인 항목을 위해 음수 허용)
ALTER TABLE quotation_items DROP CONSTRAINT IF EXISTS quotation_items_unit_price_check;

-- 5. product_id 또는 label 중 하나는 반드시 있어야 함
ALTER TABLE quotation_items ADD CONSTRAINT quotation_items_has_identity
  CHECK (product_id IS NOT NULL OR label IS NOT NULL);
