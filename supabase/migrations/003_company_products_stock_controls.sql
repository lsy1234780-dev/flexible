-- company_products 테이블에 재고 노출 제어 컬럼 추가
ALTER TABLE company_products
  ADD COLUMN IF NOT EXISTS stock_ratio integer CHECK (stock_ratio >= 1 AND stock_ratio <= 100),
  ADD COLUMN IF NOT EXISTS max_visible_stock integer CHECK (max_visible_stock >= 0);

COMMENT ON COLUMN company_products.stock_ratio IS '전체 재고 대비 노출 비율 (1~100%). null이면 미적용';
COMMENT ON COLUMN company_products.max_visible_stock IS '노출 재고 최대 상한. null이면 무제한';

-- 적용 우선순위:
-- 1. visible_stock (직접 지정값) → 최우선
-- 2. stock_ratio 적용 후 max_visible_stock으로 상한 처리
-- 3. 아무것도 없으면 base_stock 그대로 노출
