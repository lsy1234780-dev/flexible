-- 035: 출고 시리얼 추적
-- shipments = 출고(outbound dispatch) 전용
-- 나중에 입고 배송추적은 inbound_tracking 등 별도 테이블로 분리

-- 1) shipments에 시리얼 배정 레벨 추가
--    L0: 시리얼 미배정 (물류 자율)
--    L1: 시리얼 목록만 (고객 무관)
--    L2: 고객별 시리얼 매칭 완료
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS serial_level text NOT NULL DEFAULT 'L0'
  CHECK (serial_level IN ('L0', 'L1', 'L2'));

-- 메모 컬럼 (출고 관련 비고)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS memo text;

-- 2) shipment_serials: 출고건별 시리얼 매칭
CREATE TABLE IF NOT EXISTS shipment_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  serial_id uuid REFERENCES product_serials(id),     -- pool/strict: 개별 시리얼
  product_id uuid NOT NULL REFERENCES products(id),   -- 항상 필요 (none 모드 포함)
  quantity integer NOT NULL DEFAULT 1,                 -- none 모드: 시리얼 없이 수량만
  assigned_by text CHECK (assigned_by IN ('admin', 'logistics', 'auto')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shipment_serials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipment_serials_read_all" ON shipment_serials FOR SELECT USING (true);
CREATE POLICY "shipment_serials_admin_all" ON shipment_serials FOR ALL USING (true);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_shipment_serials_shipment ON shipment_serials(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_serials_serial ON shipment_serials(serial_id) WHERE serial_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_serials_product ON shipment_serials(product_id);
