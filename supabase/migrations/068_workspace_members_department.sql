-- 068: get_workspace_members에 소속(부서 라벨) 추가
--
-- DM 멤버 선택창에서 이름과 함께 소속을 보여주기 위함.
-- 부서 id는 auth.users.raw_app_meta_data->>'department', 라벨은 departments 테이블.
-- 반환 컬럼이 바뀌므로 drop 후 재생성.

drop function if exists get_workspace_members();

create function get_workspace_members()
returns table (user_id uuid, name text, email text, department text)
language sql
stable
security definer
set search_path = public
as $$
  select
    wm.user_id,
    chat_user_name(wm.user_id),
    u.email,
    d.label
  from workspace_members wm
  join auth.users u on u.id = wm.user_id
  left join departments d
    on d.workspace_id = wm.workspace_id
    and d.id = (u.raw_app_meta_data->>'department')
  where wm.workspace_id in (select current_workspace_ids())
    and wm.user_id <> auth.uid()
  order by 2;
$$;
