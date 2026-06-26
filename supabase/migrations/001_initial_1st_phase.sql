-- ============================================
-- 1차: 제품 마스터 + 입출고 이력
-- ============================================

-- 제품 마스터
CREATE TABLE IF NOT EXISTS products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  barcode         text UNIQUE NOT NULL,
  base_price      numeric NOT NULL CHECK (base_price >= 0),
  base_stock      integer NOT NULL DEFAULT 0 CHECK (base_stock >= 0),
  is_visible_default boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 입출고 이력
CREATE TABLE IF NOT EXISTS inventory_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    integer NOT NULL CHECK (quantity > 0),
  type        text NOT NULL CHECK (type IN ('in', 'out')),
  scanned_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- RLS 활성화
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- RLS 정책 — 인증된 사용자(어드민 직원)만 접근 허용
-- (2차에서 역할 분리 시 정책 세분화 예정)
CREATE POLICY "인증된 사용자만 products 조회" ON products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "인증된 사용자만 products 수정" ON products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "인증된 사용자만 inventory_logs 조회" ON inventory_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "인증된 사용자만 inventory_logs 추가" ON inventory_logs
  FOR INSERT TO authenticated WITH CHECK (true);
