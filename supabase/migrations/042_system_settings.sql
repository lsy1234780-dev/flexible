-- 042: system_settings (시스템 설정 key-value 저장)

CREATE TABLE system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 읽기: 인증된 유저 전체
CREATE POLICY "authenticated_read_settings" ON system_settings
  FOR SELECT TO authenticated USING (true);

-- 쓰기: service role만
CREATE POLICY "admin_write_settings" ON system_settings
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "admin_update_settings" ON system_settings
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "admin_delete_settings" ON system_settings
  FOR DELETE TO authenticated USING (false);

-- 기본값: 마스터 최소 레벨 3 (이사급)
INSERT INTO system_settings (key, value) VALUES
  ('super_admin_min_level', '3');
