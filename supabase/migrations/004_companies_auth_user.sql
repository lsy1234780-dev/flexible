-- B2B 포털 로그인 사용자와 업체를 연결
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_auth_user_id_idx ON companies (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN companies.auth_user_id IS 'B2B 포털 로그인 계정 (auth.users.id)';

-- B2B 포털 사용자는 자신의 company만 읽을 수 있음
CREATE POLICY "b2b_user_select_own_company" ON companies
  FOR SELECT USING (
    auth_user_id = auth.uid()
    OR type = 'admin'
  );
