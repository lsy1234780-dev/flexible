-- ============================================
-- 15차: 집하완료(packed) 상태 추가
--   - orders: packed 상태 추가 (shipped → packed → completed)
--   - shipments: packed 상태 추가, packed_at 컬럼
-- ============================================

-- 1. orders 상태에 packed 추가
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'shipped', 'packed', 'completed', 'cancelled'));

-- 2. shipments 상태에 packed 추가 + packed_at 컬럼
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check
  CHECK (status IN ('pending', 'in_progress', 'packed', 'completed'));

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS packed_at timestamptz;
