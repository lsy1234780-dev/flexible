-- 030: product_lots (LOT 번호 관리) + product_serials에 lot_id FK 추가

-- 1. product_lots 테이블
CREATE TABLE product_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_number text NOT NULL,              -- 'LOT-YYMMDD' 형태 (제조일 기준 자동생성)
  manufactured_at date NOT NULL,         -- 생산/제조일자
  received_at date,                      -- 입고일자 (선입선출 기준)
  quantity integer NOT NULL DEFAULT 0,   -- 해당 LOT 수량
  memo text,
  created_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_product_lots_product ON product_lots(product_id);
CREATE INDEX idx_product_lots_lot_number ON product_lots(lot_number);
CREATE INDEX idx_product_lots_received_at ON product_lots(received_at);

-- 2. product_serials에 lot_id 컬럼 추가
ALTER TABLE product_serials
  ADD COLUMN lot_id uuid REFERENCES product_lots(id) ON DELETE SET NULL;

CREATE INDEX idx_product_serials_lot ON product_serials(lot_id);

-- 3. RLS
ALTER TABLE product_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_lots_select" ON product_lots
  FOR SELECT USING (true);

CREATE POLICY "product_lots_insert" ON product_lots
  FOR INSERT WITH CHECK (true);

CREATE POLICY "product_lots_update" ON product_lots
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "product_lots_delete" ON product_lots
  FOR DELETE USING (true);
