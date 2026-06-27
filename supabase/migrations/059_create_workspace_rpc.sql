-- 059: 워크스페이스 생성을 SECURITY DEFINER 함수로 (anon+RLS 패턴, service role 불필요)
--
-- 배경: workspaces 테이블엔 INSERT용 RLS 정책이 없어 authenticated가 직접 못 만든다.
-- 그래서 가입(온보딩)이 service role에 의존했음. 오너 표준(anon key + RLS + SECURITY DEFINER)대로,
-- 로그인한 유저가 호출하면 자기 워크스페이스+owner+모듈을 만들어주는 통제된 함수로 전환.

create or replace function create_workspace_for_user(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- 이미 워크스페이스 멤버면 그걸 반환(중복 생성 방지)
  select workspace_id into v_ws from workspace_members where user_id = v_uid limit 1;
  if v_ws is not null then
    return v_ws;
  end if;

  -- slug 검증
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' then
    raise exception 'INVALID_SLUG';
  end if;
  if exists (select 1 from workspaces where slug = p_slug) then
    raise exception 'SLUG_TAKEN';
  end if;

  -- 생성: workspace + owner 멤버십 + 기본 모듈 시드
  insert into workspaces (name, slug, plan, status)
    values (p_name, p_slug, 'basic', 'active') returning id into v_ws;

  insert into workspace_members (workspace_id, user_id, role)
    values (v_ws, v_uid, 'owner');

  insert into workspace_modules (workspace_id, module_key, enabled)
  select v_ws, m.key, m.enabled from (values
    ('platform', true), ('partners', true), ('products', true), ('quotations', true), ('orders', true),
    ('inventory', true), ('serials', true), ('receiving', true), ('purchasing', true), ('supply', true),
    ('fulfillment', true), ('service', true), ('crm_basic', true), ('analytics', true), ('b2b_portal', true),
    ('crm_pipeline', false), ('chat', false), ('ecommerce', false), ('pos', false), ('warranty', false)
  ) as m(key, enabled);

  return v_ws;
end;
$$;
