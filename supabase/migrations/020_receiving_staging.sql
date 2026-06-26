-- 020: 입고 스테이징 테이블 + 임시상품 지원
-- 물류팀이 "전체 미입고" 탭에서 바코드 스캔 → 스테이징에 적재
-- 어드민이 나중에 입고지시서와 매칭

-- ── 입고 스테이징 (미매칭 입고 건) ──
CREATE TABLE IF NOT EXISTS receiving_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL DEFAULT 1,
  scanned_barcode text NOT NULL,
  memo text,
  matched_receiving_item_id uuid REFERENCES receiving_items(id),
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receiving_staging_product ON receiving_staging(product_id);
CREATE INDEX IF NOT EXISTS idx_receiving_staging_matched ON receiving_staging(matched_receiving_item_id);
CREATE INDEX IF NOT EXISTS idx_receiving_staging_unmatched ON receiving_staging(matched_receiving_item_id) WHERE matched_receiving_item_id IS NULL;

-- ── 임시상품 플래그 ──
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false;

-- ── product_serials에 staging 연결 컬럼 ──
ALTER TABLE product_serials ADD COLUMN IF NOT EXISTS receiving_staging_id uuid REFERENCES receiving_staging(id);
CREATE INDEX IF NOT EXISTS idx_product_serials_staging ON product_serials(receiving_staging_id);

-- ── RLS ──
ALTER TABLE receiving_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON receiving_staging FOR ALL USING (true) WITH CHECK (true);
