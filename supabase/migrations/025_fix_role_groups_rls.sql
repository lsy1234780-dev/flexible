-- FOR ALL 정책을 INSERT/UPDATE/DELETE로 분리 (WITH CHECK 추가)

-- role_groups
DROP POLICY IF EXISTS "admin_manage_role_groups" ON role_groups;

CREATE POLICY "admin_insert_role_groups" ON role_groups FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

CREATE POLICY "admin_update_role_groups" ON role_groups FOR UPDATE TO authenticated
  USING (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  )
  WITH CHECK (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

CREATE POLICY "admin_delete_role_groups" ON role_groups FOR DELETE TO authenticated
  USING (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

-- user_role_groups
DROP POLICY IF EXISTS "admin_manage_user_role_groups" ON user_role_groups;

CREATE POLICY "admin_insert_user_role_groups" ON user_role_groups FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

CREATE POLICY "admin_update_user_role_groups" ON user_role_groups FOR UPDATE TO authenticated
  USING (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  )
  WITH CHECK (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );

CREATE POLICY "admin_delete_user_role_groups" ON user_role_groups FOR DELETE TO authenticated
  USING (
    (SELECT (auth.jwt()->'app_metadata'->>'department') = 'management'
     AND (auth.jwt()->'app_metadata'->>'position') = 'director')
  );
