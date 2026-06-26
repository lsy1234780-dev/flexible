-- 046: companies 테이블 type enum → boolean 플래그 전환
-- is_supplier: 공급처 여부 (발주 대상)
-- is_customer: 고객사 여부 (B2B 포털 사용, 수주 대상)
-- purchase_orders.supplier_id FK 추가

-- ── 1) boolean 플래그 추가 ──
ALTER TABLE companies ADD COLUMN is_supplier boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN is_customer boolean NOT NULL DEFAULT false;

-- ── 2) 기존 type 데이터 마이그레이션 ──
-- b2b → is_customer = true (B2B 포털 사용 업체)
UPDATE companies SET is_customer = true WHERE type = 'b2b';
-- admin → 기본값 유지 (is_supplier, is_customer 모두 false — 필요 시 수동 지정)

-- ── 3) type 컬럼에 의존하는 RLS 정책 제거 후 컬럼 삭제 ──
DROP POLICY IF EXISTS "b2b_user_select_own_company" ON companies;
ALTER TABLE companies DROP COLUMN type;

-- ── 3-1) RLS 정책 재생성 (is_customer 기반) ──
-- B2B 포털 사용자는 자신의 company만 읽을 수 있고, 비고객사(admin 전용)는 전체 허용
CREATE POLICY "b2b_user_select_own_company" ON companies
  FOR SELECT USING (
    auth_user_id = auth.uid()
    OR is_customer = false
  );

-- ── 4) purchase_orders에 supplier_id FK 추가 ──
ALTER TABLE purchase_orders
  ADD COLUMN supplier_id uuid REFERENCES companies(id) ON DELETE SET NULL;

-- ── 5) 인덱스 ──
CREATE INDEX idx_companies_is_supplier ON companies(is_supplier) WHERE is_supplier = true;
CREATE INDEX idx_companies_is_customer ON companies(is_customer) WHERE is_customer = true;
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
