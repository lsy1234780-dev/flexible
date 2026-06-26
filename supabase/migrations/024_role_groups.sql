-- 역할 그룹 (예: '2610행사TF', '물류팀 기본')
CREATE TABLE role_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  allowed_menus text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 유저-그룹 매핑 (N:N)
CREATE TABLE user_role_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_group_id uuid NOT NULL REFERENCES role_groups(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role_group_id)
);

-- RLS
ALTER TABLE role_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_role_groups" ON role_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_role_groups" ON role_groups FOR ALL TO authenticated
  USING (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

CREATE POLICY "admin_read_user_role_groups" ON user_role_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_user_role_groups" ON user_role_groups FOR ALL TO authenticated
  USING (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

-- 인덱스
CREATE INDEX idx_user_role_groups_user ON user_role_groups(user_id);
CREATE INDEX idx_user_role_groups_group ON user_role_groups(role_group_id);
