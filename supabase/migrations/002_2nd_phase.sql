-- ============================================
-- 2차: 업체 + 견적서
-- ============================================

-- 업체
CREATE TABLE IF NOT EXISTS companies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('admin', 'b2b')),
  status     text NOT NULL CHECK (status IN ('pending', 'active', 'suspended')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 업체별 제품 단가·수량 오버라이드
CREATE TABLE IF NOT EXISTS company_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  custom_price numeric CHECK (custom_price >= 0),
  visible_stock integer,
  is_visible   boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, product_id)
);

-- 견적서 헤더
CREATE TABLE IF NOT EXISTS quotations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  number     text UNIQUE NOT NULL,
  status     text NOT NULL CHECK (status IN ('draft', 'sent', 'confirmed')) DEFAULT 'draft',
  issued_at  timestamptz NOT NULL DEFAULT now()
);

-- 견적서 라인 아이템
CREATE TABLE IF NOT EXISTS quotation_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id),
  quantity      integer NOT NULL CHECK (quantity > 0),
  unit_price    numeric NOT NULL CHECK (unit_price >= 0)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_company_products_company ON company_products(company_id);
CREATE INDEX IF NOT EXISTS idx_quotations_company ON quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);

-- RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "인증된 사용자만 companies 접근" ON companies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "인증된 사용자만 company_products 접근" ON company_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "인증된 사용자만 quotations 접근" ON quotations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "인증된 사용자만 quotation_items 접근" ON quotation_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
