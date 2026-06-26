-- 메뉴별 접근 권한 설정 (부서/직급)
-- allowed_departments가 비어있으면 전체 부서 허용
-- allowed_positions가 비어있으면 전체 직급 허용
-- 둘 다 값이 있으면 AND 조건 (부서+직급 모두 해당해야 접근)
-- director는 항상 전체 접근 (코드에서 처리)
CREATE TABLE menu_access_rules (
  menu_href text PRIMARY KEY,
  allowed_departments text[] NOT NULL DEFAULT '{}',
  allowed_positions text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE menu_access_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_menu_access" ON menu_access_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_insert_menu_access" ON menu_access_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

CREATE POLICY "admin_update_menu_access" ON menu_access_rules
  FOR UPDATE TO authenticated
  USING (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  )
  WITH CHECK (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

CREATE POLICY "admin_delete_menu_access" ON menu_access_rules
  FOR DELETE TO authenticated
  USING (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

-- 기본값 시드 (현재 하드코딩된 값 기반, 직급 제한 없음)
INSERT INTO menu_access_rules (menu_href, allowed_departments) VALUES
  ('/products',   ARRAY['management', 'sales']),
  ('/categories', ARRAY['management', 'sales']),
  ('/inventory',  ARRAY['management', 'sales', 'logistics']),
  ('/receiving',  ARRAY['management', 'logistics']),
  ('/companies',  ARRAY['management', 'sales']),
  ('/quotations', ARRAY['management', 'sales']),
  ('/orders',     ARRAY['management', 'sales']),
  ('/serials',    ARRAY['management', 'logistics']);
