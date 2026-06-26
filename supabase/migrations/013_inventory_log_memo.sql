-- 013: inventory_logs에 비고(memo) 컬럼 추가
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS memo text;
