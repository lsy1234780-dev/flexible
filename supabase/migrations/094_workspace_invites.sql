-- 094: 워크스페이스 초대코드
--
-- 플랫폼화 가입 이원화:
--   - 새 회사(도입 담당자) → /signup → 온보딩(워크스페이스 생성) [기존]
--   - 기존 회사 직원 → /join → 초대코드 입력 → 멤버로 합류 [이번]
--
-- 쓰기는 전부 SECURITY DEFINER RPC로만 (직접 insert 정책 없음):
--   create_workspace_invite  — owner/admin만 발급
--   revoke_workspace_invite  — owner/admin만 회수
--   join_workspace_with_code — 로그인 유저가 코드로 합류 (비멤버도 호출 가능해야 하므로 RPC 필수)

create table workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer,                          -- null = 무제한
  used_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_workspace_invites_ws on workspace_invites(workspace_id);

alter table workspace_invites enable row level security;

-- 조회: 해당 워크스페이스의 owner/admin만 (일반 멤버에게 코드 노출 불필요)
create policy invites_select on workspace_invites
  for select to authenticated
  using (
    workspace_id in (
      select wm.workspace_id from workspace_members wm
      where wm.user_id = (select auth.uid()) and wm.role in ('owner', 'admin')
    )
  );

-- 발급 — owner/admin만. 코드 형식: FLX-XXXXXX (혼동 문자 제외)
create or replace function create_workspace_invite(p_expires_days integer default 7, p_max_uses integer default null)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_code text;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 0/O/1/I/L 제외
  v_i integer;
begin
  select wm.workspace_id into v_ws
  from workspace_members wm
  where wm.user_id = auth.uid()
    and wm.role in ('owner', 'admin')
  order by wm.created_at
  limit 1;
  if v_ws is null then
    raise exception '권한이 없습니다 (워크스페이스 관리자만 초대코드를 발급할 수 있습니다)';
  end if;

  if p_expires_days is null or p_expires_days < 1 or p_expires_days > 90 then
    raise exception 'INVALID_EXPIRY:만료 기간은 1~90일이어야 합니다';
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'INVALID_MAX_USES';
  end if;

  -- 유니크 충돌 시 재시도 (최대 5회)
  for v_i in 1..5 loop
    v_code := 'FLX-' || (
      select string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
      from generate_series(1, 6)
    );
    begin
      return query
      insert into workspace_invites (workspace_id, code, created_by, expires_at, max_uses)
      values (v_ws, v_code, auth.uid(), now() + make_interval(days => p_expires_days), p_max_uses)
      returning workspace_invites.id, workspace_invites.code, workspace_invites.expires_at;
      return;
    exception when unique_violation then
      -- 재시도
    end;
  end loop;
  raise exception 'CODE_GENERATION_FAILED';
end;
$$;

-- 회수 — 발급 권한과 동일 (자기 워크스페이스 것만)
create or replace function revoke_workspace_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update workspace_invites wi
  set revoked_at = now()
  from workspace_members wm
  where wi.id = p_id
    and wi.revoked_at is null
    and wm.workspace_id = wi.workspace_id
    and wm.user_id = auth.uid()
    and wm.role in ('owner', 'admin');
  if not found then
    raise exception '초대코드를 찾을 수 없거나 권한이 없습니다';
  end if;
end;
$$;

-- 합류 — 로그인 유저가 코드 입력. 이미 멤버면 멱등(그대로 워크스페이스 반환).
create or replace function join_workspace_with_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite workspace_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_invite
  from workspace_invites
  where code = upper(trim(p_code))
  for update;

  if not found or v_invite.revoked_at is not null or v_invite.expires_at < now()
     or (v_invite.max_uses is not null and v_invite.used_count >= v_invite.max_uses) then
    raise exception 'INVALID_CODE:유효하지 않거나 만료된 초대코드입니다';
  end if;

  -- 이미 그 워크스페이스 멤버 → 멱등
  if exists (
    select 1 from workspace_members
    where workspace_id = v_invite.workspace_id and user_id = v_uid
  ) then
    return v_invite.workspace_id;
  end if;

  -- 다른 워크스페이스 멤버인 계정은 합류 불가 (1계정 1워크스페이스 정책 유지)
  if exists (select 1 from workspace_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_WORKSPACE:이미 다른 워크스페이스에 소속된 계정입니다';
  end if;

  insert into workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, v_uid, 'member');

  update workspace_invites set used_count = used_count + 1 where id = v_invite.id;

  return v_invite.workspace_id;
end;
$$;

-- 실행 권한: 로그인 유저만 (071/072 하드닝 패턴)
revoke execute on function create_workspace_invite(integer, integer) from public, anon;
revoke execute on function revoke_workspace_invite(uuid) from public, anon;
revoke execute on function join_workspace_with_code(text) from public, anon;
grant execute on function create_workspace_invite(integer, integer) to authenticated;
grant execute on function revoke_workspace_invite(uuid) to authenticated;
grant execute on function join_workspace_with_code(text) to authenticated;
