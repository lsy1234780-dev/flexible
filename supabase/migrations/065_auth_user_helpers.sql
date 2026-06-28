-- 065: auth.users 접근 헬퍼 (SECURITY DEFINER) — service role 의존 제거
--
-- 기존 ERP 코드가 createAdminClient(service role)로 auth.admin API를 호출하던 부분을
-- anon+RLS로 전환하기 위한 헬퍼. service role 키가 비어 있어 발생하던
-- "supabaseKey is required"의 근본 원인 제거(설정 유저목록/역할변경, 주문 알림 이메일).

-- 현재 워크스페이스 멤버 유저 목록 (설정 RBAC 화면)
create or replace function get_workspace_users()
returns table (id uuid, email text, department text, "position" text, created_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email,
    u.raw_app_meta_data->>'department',
    u.raw_app_meta_data->>'position',
    u.created_at, u.last_sign_in_at
  from auth.users u
  join workspace_members wm on wm.user_id = u.id
  where wm.workspace_id in (select current_workspace_ids());
$$;

-- 유저 이메일 단건 (주문 확정 알림 등)
create or replace function get_user_email(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from auth.users where id = p_user;
$$;

-- 유저 부서/직급(app_metadata) 설정 — 워크스페이스 오너/관리자만
create or replace function set_user_app_role(p_user uuid, p_department text, p_position text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
begin
  select wm.workspace_id into v_ws
  from workspace_members wm
  where wm.user_id = auth.uid()
    and wm.role in ('owner', 'admin')
    and wm.workspace_id in (select current_workspace_ids())
    and exists (
      select 1 from workspace_members t
      where t.workspace_id = wm.workspace_id and t.user_id = p_user
    )
  limit 1;

  if v_ws is null then
    raise exception '권한이 없습니다 (워크스페이스 관리자만 역할을 변경할 수 있습니다)';
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('department', p_department, 'position', p_position)
  where id = p_user;
end;
$$;
