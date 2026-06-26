-- 협력사 접속 IP 이력
CREATE TABLE IF NOT EXISTS access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- 직접 접근 차단 (service role만 사용)
CREATE POLICY "no_direct_access_logs" ON access_logs USING (false);
