-- 036: 출고 시리얼 결정 주체 추가 + serial_level 정리
--
-- serial_source: 시리얼을 누가 결정하는가 (L0이면 NULL)
--   admin: 어드민이 출고 전 미리 지정
--   logistics: 물류가 출고 시 현장에서 결정
--
-- serial_level CHECK 변경: L2 제거 (묶음 출고 구현 시 추가 예정)

-- 1) serial_source 컬럼 추가
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS serial_source text
  CHECK (serial_source IN ('admin', 'logistics'));

-- 2) serial_level CHECK 수정: L0, L1만 허용
--    기존 L2 데이터가 있으면 L1로 변환
UPDATE shipments SET serial_level = 'L1' WHERE serial_level = 'L2';
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_serial_level_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_serial_level_check
  CHECK (serial_level IN ('L0', 'L1'));
