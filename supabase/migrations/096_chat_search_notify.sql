-- 096: 채팅 P1 — 메시지 검색 + 채널 뮤트 + DND(알림 일시중지)
--
-- ① 메시지 부분일치 검색 (pg_trgm)
--    한국어는 형태소 사전 없이 tsvector가 부실하므로, trigram GIN 인덱스 + ilike가 실용적.
--    RLS(ws_isolation + DM 정책)가 그대로 적용되므로 검색도 내가 볼 수 있는 메시지만 나온다.
--
-- ② channel_members.muted — 채널별 알림 끄기 (푸시만 끔, 안읽음 표시는 유지)
--
-- ③ notification_settings — 유저 전역 DND. dnd_until이 미래면 그때까지 푸시 스킵.

-- ① 검색 인덱스
create extension if not exists pg_trgm;
create index idx_messages_body_trgm on messages using gin (body gin_trgm_ops);

-- ② 채널 뮤트
alter table channel_members add column muted boolean not null default false;

-- 뮤트 토글 (멤버십 없으면 생성 — mark_channel_read와 같은 패턴)
create or replace function set_channel_muted(p_channel uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from channels where id = p_channel;
  if v_ws is null or not (v_ws in (select current_workspace_ids())) then
    return;
  end if;
  insert into channel_members (channel_id, user_id, workspace_id, muted)
  values (p_channel, auth.uid(), v_ws, p_muted)
  on conflict (channel_id, user_id)
  do update set muted = excluded.muted;
end;
$$;
revoke execute on function set_channel_muted(uuid, boolean) from public, anon;
grant execute on function set_channel_muted(uuid, boolean) to authenticated, service_role;

-- get_my_channels에 muted 반환 추가 (반환 컬럼 변경 → drop 후 재생성, 085와 같은 패턴)
drop function if exists get_my_channels();

create or replace function get_my_channels()
returns table (id uuid, name text, kind text, partner_id uuid, partner_name text, unread bigint, muted boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.kind,
    p.user_id as partner_id,
    case when c.kind = 'dm' then chat_user_name(p.user_id) end as partner_name,
    coalesce((
      select count(*)
      from messages m
      left join channel_members cm on cm.channel_id = m.channel_id and cm.user_id = auth.uid()
      where m.channel_id = c.id
        and m.deleted_at is null
        and m.author_id is distinct from auth.uid()
        and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
    ), 0) as unread,
    coalesce((
      select cm3.muted from channel_members cm3
      where cm3.channel_id = c.id and cm3.user_id = auth.uid()
    ), false) as muted
  from channels c
  left join lateral (
    select cm2.user_id
    from channel_members cm2
    where c.kind = 'dm' and cm2.channel_id = c.id and cm2.user_id <> auth.uid()
    limit 1
  ) p on true
  where c.workspace_id in (select current_workspace_ids())
    and (
      c.kind = 'channel'
      or (c.kind = 'dm' and exists (
        select 1 from channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid()
      ))
    )
  order by c.kind, c.created_at;
$$;
revoke execute on function get_my_channels() from public, anon;
grant execute on function get_my_channels() to authenticated, service_role;

-- ③ DND (알림 일시중지)
create table notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dnd_until timestamptz,               -- null = DND 아님
  updated_at timestamptz not null default now()
);

alter table notification_settings enable row level security;
create policy own_settings on notification_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
