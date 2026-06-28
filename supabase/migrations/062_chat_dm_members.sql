-- 062: 채팅 — 다이렉트 메시지(DM) + 워크스페이스 멤버 조회
--
-- DM은 channels.kind='dm' (멤버 2명). 공개 채널은 누구나 보이지만 DM은 멤버만.
-- auth.users 접근이 필요해 모두 SECURITY DEFINER로 감싼다(클라이언트는 RPC만).

-- 표시 이름 헬퍼: user_metadata.full_name → name → 이메일 앞부분
create or replace function chat_user_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1),
    '사용자'
  )
  from auth.users u
  where u.id = p_user;
$$;

-- 현재 워크스페이스의 멤버 목록 (나 제외) — DM 시작용
create or replace function get_workspace_members()
returns table (user_id uuid, name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select wm.user_id, chat_user_name(wm.user_id), u.email
  from workspace_members wm
  join auth.users u on u.id = wm.user_id
  where wm.workspace_id in (select current_workspace_ids())
    and wm.user_id <> auth.uid()
  order by 2;
$$;

-- 상대와의 1:1 DM 채널을 찾거나 생성 (멱등)
create or replace function get_or_create_dm(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_id uuid;
begin
  -- 나와 상대가 함께 속한 워크스페이스
  select wm.workspace_id into v_ws
  from workspace_members wm
  where wm.user_id = auth.uid()
    and wm.workspace_id in (select current_workspace_ids())
    and exists (
      select 1 from workspace_members w2
      where w2.workspace_id = wm.workspace_id and w2.user_id = p_other
    )
  limit 1;
  if v_ws is null then
    raise exception '같은 워크스페이스 멤버가 아닙니다';
  end if;

  -- 기존 DM 재사용
  select c.id into v_id
  from channels c
  where c.workspace_id = v_ws and c.kind = 'dm'
    and (select count(*) from channel_members cm where cm.channel_id = c.id) = 2
    and exists (select 1 from channel_members where channel_id = c.id and user_id = auth.uid())
    and exists (select 1 from channel_members where channel_id = c.id and user_id = p_other)
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into channels (workspace_id, name, kind, is_private, created_by)
  values (v_ws, 'dm', 'dm', true, auth.uid())
  returning id into v_id;

  insert into channel_members (channel_id, user_id, workspace_id) values
    (v_id, auth.uid(), v_ws),
    (v_id, p_other, v_ws);

  return v_id;
end;
$$;

-- 내가 볼 수 있는 채널 목록 (공개 채널 + 내 DM) + DM 상대 이름 + 안읽음 수
create or replace function get_my_channels()
returns table (id uuid, name text, kind text, partner_name text, unread bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.kind,
    case when c.kind = 'dm' then (
      select chat_user_name(cm2.user_id)
      from channel_members cm2
      where cm2.channel_id = c.id and cm2.user_id <> auth.uid()
      limit 1
    ) end as partner_name,
    coalesce((
      select count(*)
      from messages m
      left join channel_members cm on cm.channel_id = m.channel_id and cm.user_id = auth.uid()
      where m.channel_id = c.id
        and m.deleted_at is null
        and m.author_id is distinct from auth.uid()
        and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
    ), 0) as unread
  from channels c
  where c.workspace_id in (select current_workspace_ids())
    and (
      c.kind = 'channel'
      or (c.kind = 'dm' and exists (
        select 1 from channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid()
      ))
    )
  order by c.kind, c.created_at;
$$;
