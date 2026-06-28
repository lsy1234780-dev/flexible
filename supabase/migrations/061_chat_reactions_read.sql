-- 061: 채팅 고도화 — 이모지 반응 + 읽음/안읽음 + 스레드 지원 함수
--
-- 스레드(reply_to)와 읽음(last_read_at)은 060에서 컬럼만 깔아둠 → 여기서 동작 추가.
-- 반응만 새 테이블. 모두 workspace_id + 표준 ws_isolation RLS.

-- ─── 이모지 반응 ───
create table message_reactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index idx_message_reactions_msg on message_reactions (message_id);

alter table message_reactions enable row level security;
create policy ws_isolation on message_reactions for all to authenticated
  using (workspace_id in (select current_workspace_ids()))
  with check (workspace_id in (select current_workspace_ids()));

-- realtime: 반응 변경도 구독 (RLS가 워크스페이스별 자동 필터)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table message_reactions;
  end if;
end $$;

-- ─── 읽음 처리 ───
-- 현재 유저의 채널 멤버십 last_read_at을 now()로 (없으면 생성). 멱등.
create or replace function mark_channel_read(p_channel uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from channels where id = p_channel;
  if v_ws is null then
    return;
  end if;
  if not (v_ws in (select current_workspace_ids())) then
    return;
  end if;
  insert into channel_members (channel_id, user_id, workspace_id, last_read_at)
  values (p_channel, auth.uid(), v_ws, now())
  on conflict (channel_id, user_id)
  do update set last_read_at = now();
end;
$$;

-- 채널별 안읽음 개수 (내가 보낸 건 제외, last_read_at 이후 메시지).
-- 멤버십 없으면 전체가 안읽음(-infinity 기준).
create or replace function get_channel_unreads()
returns table (channel_id uuid, unread bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.channel_id, count(*)
  from messages m
  left join channel_members cm
    on cm.channel_id = m.channel_id and cm.user_id = auth.uid()
  where m.channel_id is not null
    and m.deleted_at is null
    and m.author_id is distinct from auth.uid()
    and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
    and m.workspace_id in (select current_workspace_ids())
  group by m.channel_id;
$$;
