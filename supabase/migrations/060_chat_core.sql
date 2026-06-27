-- 060: 채팅 코어 (chat 모듈) — 채널 + 메시지 + 엔티티 멘션 + realtime
--
-- 비전 핵심: 엔티티 멘션(메시지에서 주문/딜/거래처 태그 → 양방향 링크).
-- message_mentions가 그 심장 (다형성 entity_type+entity_id).
-- 모두 workspace_id + 표준 ws_isolation RLS. realtime은 messages 테이블에 켠다.

-- 채널
create table channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  kind text not null default 'channel' check (kind in ('channel', 'dm')),
  is_private boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_channels_ws on channels (workspace_id, created_at);

-- 채널 멤버십 (읽음 상태 + 비공개 채널용)
create table channel_members (
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- 메시지 (채널 대화 OR 레코드 첨부 스레드)
create table messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  channel_id uuid references channels(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,                    -- 표시용 비정규화(auth.users 조인 회피)
  body text not null,
  context_type text,                   -- 레코드 스레드일 때 'order','deal'...
  context_id uuid,
  reply_to uuid references messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (channel_id is not null or (context_type is not null and context_id is not null))
);
create index idx_messages_channel on messages (channel_id, created_at);
create index idx_messages_context on messages (context_type, context_id, created_at);

-- ★ 엔티티 멘션 (양방향 연결의 심장 — 다형성, FK 없음)
create table message_mentions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  entity_type text not null,           -- 'company','deal','product','order'...
  entity_id uuid not null,
  label text not null,                 -- 멘션 시점 표시 텍스트(스냅샷)
  created_at timestamptz not null default now()
);
create index idx_message_mentions_entity on message_mentions (entity_type, entity_id); -- 역방향 조회
create index idx_message_mentions_msg on message_mentions (message_id);

-- RLS (표준 워크스페이스 격리)
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table message_mentions enable row level security;

create policy ws_isolation on channels for all to authenticated
  using (workspace_id in (select current_workspace_ids()))
  with check (workspace_id in (select current_workspace_ids()));
create policy ws_isolation on channel_members for all to authenticated
  using (workspace_id in (select current_workspace_ids()))
  with check (workspace_id in (select current_workspace_ids()));
create policy ws_isolation on messages for all to authenticated
  using (workspace_id in (select current_workspace_ids()))
  with check (workspace_id in (select current_workspace_ids()));
create policy ws_isolation on message_mentions for all to authenticated
  using (workspace_id in (select current_workspace_ids()))
  with check (workspace_id in (select current_workspace_ids()));

-- realtime: messages 변경을 구독 가능하게 (RLS가 워크스페이스별로 자동 필터)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table messages;
  end if;
end $$;

-- 기본 채널(#general) 시드 (멱등) — chat 모듈 켜고 첫 진입 시
create or replace function seed_default_channels(p_ws uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from channels where workspace_id = p_ws) then
    return;
  end if;
  insert into channels (workspace_id, name, kind) values (p_ws, 'general', 'channel');
end;
$$;
