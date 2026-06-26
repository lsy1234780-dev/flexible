-- 출하완료 알림 발송 시각 추적
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS notified_at timestamptz;
