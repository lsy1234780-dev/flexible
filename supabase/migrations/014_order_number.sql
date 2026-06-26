-- ============================================
-- 14차: 발주 번호 (order_number) 추가
--   - 형식: ORD-YYMMDD-NNN (일별 시퀀스)
--   - 예: ORD-260309-001
-- ============================================

-- 1. 컬럼 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number text;

-- 2. 기존 데이터에 번호 부여
WITH numbered AS (
  SELECT id,
         'ORD-' || to_char(created_at, 'YYMMDD') || '-' ||
         lpad(row_number() OVER (
           PARTITION BY created_at::date ORDER BY created_at
         )::text, 3, '0') AS num
  FROM orders
)
UPDATE orders o SET order_number = n.num
FROM numbered n WHERE o.id = n.id AND o.order_number IS NULL;

-- 3. 유니크 + NOT NULL 설정 (기존 데이터 채운 후)
-- 주의: 아직 기존 데이터가 없을 수도 있으므로 nullable로 유지하되, 앱에서 항상 생성
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_idx ON orders(order_number) WHERE order_number IS NOT NULL;

-- 4. 발주번호 자동 생성 함수
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_date text;
  v_seq  integer;
BEGIN
  IF NEW.order_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_date := to_char(now(), 'YYMMDD');

  SELECT count(*) + 1 INTO v_seq
  FROM orders
  WHERE order_number LIKE 'ORD-' || v_date || '-%';

  NEW.order_number := 'ORD-' || v_date || '-' || lpad(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;

-- 5. 트리거
DROP TRIGGER IF EXISTS trg_generate_order_number ON orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();
