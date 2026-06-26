-- 037: 시리얼 추적 레벨 L0~L3 체계 정의
--
-- L0: 시리얼 미추적 (수량만 확인)
-- L1: 시리얼 추적 — 물류가 스캔 후 DB에서 선택, 매칭은 어드민이 사후 처리
-- L2: 시리얼 추적 — 어드민이 시리얼 목록 배정, 물류는 바코드+고객+목록에서 선택
-- L3: 시리얼 추적 — 물류가 바코드·고객·시리얼 모두 입력
--
-- serial_source 컬럼은 deprecated (L 레벨이 역할을 포함하므로 불필요)

-- 1) serial_level CHECK 확장: L0~L3 허용
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_serial_level_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_serial_level_check
  CHECK (serial_level IN ('L0', 'L1', 'L2', 'L3'));

-- 2) 기존 L1 + serial_source 데이터 → 새 레벨로 변환
--    source=logistics → L1 (물류 스캔, 어드민 매칭)
--    source=admin    → L2 (어드민 배정, 물류 확인)
UPDATE shipments SET serial_level = 'L2'
  WHERE serial_level = 'L1' AND serial_source = 'admin';
UPDATE shipments SET serial_level = 'L1'
  WHERE serial_level = 'L1' AND serial_source = 'logistics';
-- serial_source가 null인 L1은 L1 유지

-- 3) serial_source는 남겨두되 향후 제거 예정 (코드에서 더 이상 사용 안 함)
COMMENT ON COLUMN shipments.serial_source IS 'DEPRECATED: L0~L3 레벨이 역할을 포함. 향후 제거 예정.';
