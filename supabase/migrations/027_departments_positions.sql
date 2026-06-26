-- 부서 테이블
CREATE TABLE departments (
  id text PRIMARY KEY,          -- 'management', 'sales', 'logistics' 등
  label text NOT NULL,          -- '경영', '영업', '물류'
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 직급 테이블
CREATE TABLE positions (
  id text PRIMARY KEY,          -- 'staff', 'manager', 'director' 등
  label text NOT NULL,          -- '사원', '팀장', '이사'
  level integer NOT NULL DEFAULT 0,  -- 직급 레벨 (높을수록 상위)
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- 읽기: 인증된 유저 전체
CREATE POLICY "authenticated_read_departments" ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_positions" ON positions FOR SELECT TO authenticated USING (true);

-- 쓰기: service role (createAdminClient)로만 처리
CREATE POLICY "admin_insert_departments" ON departments FOR INSERT TO authenticated
  WITH CHECK (false);  -- service role만 가능
CREATE POLICY "admin_update_departments" ON departments FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "admin_delete_departments" ON departments FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "admin_insert_positions" ON positions FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "admin_update_positions" ON positions FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "admin_delete_positions" ON positions FOR DELETE TO authenticated
  USING (false);

-- 기본 시드 데이터
INSERT INTO departments (id, label, sort_order) VALUES
  ('management', '경영', 1),
  ('sales', '영업', 2),
  ('logistics', '물류', 3);

INSERT INTO positions (id, label, level) VALUES
  ('staff', '사원', 1),
  ('manager', '팀장', 2),
  ('director', '이사', 3);
