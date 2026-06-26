-- 업체 담당자 연락처 정보 추가
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS contact_name text,          -- 담당자 이름
  ADD COLUMN IF NOT EXISTS contact_phone text,         -- 유선전화 (핸드폰/사무실)
  ADD COLUMN IF NOT EXISTS contact_email text,         -- 담당자 이메일 (로그인 계정과 별개)
  ADD COLUMN IF NOT EXISTS contact_position text;      -- 직무/직책

-- B2B 사용자가 자기 회사 담당자 정보를 수정할 수 있도록 RLS 정책
CREATE POLICY "b2b_update_own_contact" ON companies
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());
