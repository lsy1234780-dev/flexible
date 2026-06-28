-- 064: 모듈 토글을 anon+RLS(SECURITY DEFINER)로 — service role 의존 제거
--
-- 기존 setModuleEnabled가 createAdminClient(service role)를 썼는데,
-- 이 프로젝트는 service role 키를 런타임에 쓰지 않으므로(빈 값) "supabaseKey is required" 발생.
-- 오너 표준대로 SECURITY DEFINER 함수로 전환. 호출자가 워크스페이스 오너/관리자인지 확인 후 upsert.

create or replace function set_workspace_module(p_key text, p_enabled boolean)
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
    and wm.workspace_id in (select current_workspace_ids())
    and wm.role in ('owner', 'admin')
  order by wm.created_at
  limit 1;

  if v_ws is null then
    raise exception '권한이 없습니다 (워크스페이스 관리자만 모듈을 변경할 수 있습니다)';
  end if;

  insert into workspace_modules (workspace_id, module_key, enabled)
  values (v_ws, p_key, p_enabled)
  on conflict (workspace_id, module_key) do update set enabled = excluded.enabled;
end;
$$;
