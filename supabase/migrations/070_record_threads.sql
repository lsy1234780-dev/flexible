-- 070: 레코드 스레드 — 레코드(수주·제품·거래처·A/S)에 직접 붙는 대화 + 시스템 메시지
--
-- F안(레코드 중심 협업) 구현의 DB 레이어.
-- 설계: 레코드당 channels(kind='record') 1개를 지연 생성(첫 메시지 시점).
--       기존 채널 인프라(메시지·반응·첨부·멘션·읽음·realtime)를 그대로 재사용한다.
--       messages.context_type/context_id(060) 대신 채널 방식을 쓰는 이유:
--       읽음 상태(channel_members)·안읽음 집계·get_my_mentions가 공짜로 따라오기 때문.

-- ─── channels: kind 'record' + 엔티티 바인딩 ───
alter table channels drop constraint if exists channels_kind_check;
alter table channels add constraint channels_kind_check
  check (kind in ('channel', 'dm', 'record'));

alter table channels add column if not exists entity_type text;
alter table channels add column if not exists entity_id uuid;
alter table channels add column if not exists entity_label text;  -- 표시용 스냅샷 (ORD-2025-0845 등)

-- 레코드당 스레드 1개 (워크스페이스 스코프)
create unique index if not exists uq_channels_record
  on channels (workspace_id, entity_type, entity_id)
  where kind = 'record';

-- ─── messages: 시스템(ERP 봇) 메시지 플래그 ───
-- 상태 전이(확정/출고/취소 등)가 대화 흐름에 자동 기록된다. UI는 회색 한 줄로 렌더.
alter table messages add column if not exists is_system boolean not null default false;

-- ─── 레코드 스레드 채널 찾기/생성 (멱등) ───
-- p_ws는 서버(getCurrentWorkspaceId)가 전달하고, current_workspace_ids()로 검증한다.
create or replace function get_or_create_record_channel(
  p_ws uuid,
  p_type text,
  p_id uuid,
  p_label text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (p_ws in (select current_workspace_ids())) then
    raise exception '워크스페이스 접근 권한이 없습니다';
  end if;

  select c.id into v_id
  from channels c
  where c.workspace_id = p_ws
    and c.kind = 'record'
    and c.entity_type = p_type
    and c.entity_id = p_id;
  if v_id is not null then
    -- 라벨이 바뀌었으면 갱신 (주문번호 재발급 등)
    update channels set entity_label = p_label
      where id = v_id and entity_label is distinct from p_label;
    return v_id;
  end if;

  insert into channels (workspace_id, name, kind, entity_type, entity_id, entity_label, created_by)
  values (p_ws, coalesce(p_label, p_type), 'record', p_type, p_id, p_label, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── get_my_channels: 레코드 스레드는 채널 목록에서 제외 ───
-- (레코드 스레드는 레코드 상세 화면에서만 보인다 — 채팅 사이드바를 오염시키지 않는다)
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

-- ─── get_my_mentions: 레코드 스레드 정보 포함 (인박스에서 레코드로 딥링크) ───
-- 반환 컬럼이 늘어나므로 drop 후 재생성 (시그니처 변경).
drop function if exists get_my_mentions(int);

create or replace function get_my_mentions(p_limit int default 20)
returns table (
  message_id uuid,
  channel_id uuid,
  channel_name text,
  channel_kind text,
  author_name text,
  body text,
  created_at timestamptz,
  is_unread boolean,
  entity_type text,
  entity_id uuid,
  entity_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, m.channel_id, c.name, c.kind, m.author_name, m.body, m.created_at,
    (m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)) as is_unread,
    c.entity_type, c.entity_id, c.entity_label
  from message_mentions mm
  join messages m on m.id = mm.message_id
  left join channels c on c.id = m.channel_id
  left join channel_members cm on cm.channel_id = m.channel_id and cm.user_id = auth.uid()
  where mm.entity_type = 'user'
    and mm.entity_id = auth.uid()
    and mm.workspace_id in (select current_workspace_ids())
    and m.deleted_at is null
    and m.author_id is distinct from auth.uid()
  order by m.created_at desc
  limit p_limit;
$$;

-- ─── 레코드 스레드 최근 활동 (인박스 피드용) ───
-- 워크스페이스의 레코드 스레드에서 최근 오간 대화. 내가 보낸 것 제외 옵션 없이 전체
-- (팀 활동 피드 성격 — "어떤 레코드에서 지금 논의가 벌어지는가").
create or replace function get_record_activity(p_limit int default 20)
returns table (
  message_id uuid,
  channel_id uuid,
  author_name text,
  body text,
  is_system boolean,
  created_at timestamptz,
  entity_type text,
  entity_id uuid,
  entity_label text,
  is_unread boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, m.channel_id, m.author_name, m.body, m.is_system, m.created_at,
    c.entity_type, c.entity_id, c.entity_label,
    (m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)) as is_unread
  from messages m
  join channels c on c.id = m.channel_id and c.kind = 'record'
  left join channel_members cm on cm.channel_id = m.channel_id and cm.user_id = auth.uid()
  where m.workspace_id in (select current_workspace_ids())
    and m.deleted_at is null
  order by m.created_at desc
  limit p_limit;
$$;
