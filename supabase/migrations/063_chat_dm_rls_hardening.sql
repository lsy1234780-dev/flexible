-- 063: 채팅 RLS 하드닝 — DM은 채널 멤버만 읽기
--
-- 060의 ws_isolation은 "워크스페이스 멤버면 모든 채널 메시지 열람" 수준이라
-- 같은 워크스페이스의 다른 사람이 DM channel_id만 알면 메시지를 읽을 수 있었다.
-- 여기서 "채널 접근 가능 여부"(공개 채널 OR 내가 그 채널 멤버)로 격리를 좁힌다.
--
-- 핵심: can_access_channel()을 SECURITY DEFINER로 만들어 정책 안에서 호출 →
--       channels/channel_members를 RLS 우회로 읽으므로 정책 간 재귀가 없다.

create or replace function can_access_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from channels c
    where c.id = p_channel
      and c.workspace_id in (select current_workspace_ids())
      and (
        c.kind = 'channel'  -- 공개 채널: 워크스페이스 멤버 전원
        or exists (         -- 비공개/DM: 채널 멤버만
          select 1 from channel_members cm
          where cm.channel_id = c.id and cm.user_id = auth.uid()
        )
      )
  );
$$;

-- ─── channels ───
drop policy ws_isolation on channels;

create policy channels_select on channels for select to authenticated
  using (can_access_channel(id));
-- 공개 채널 생성은 클라이언트(anon+RLS), DM 채널은 get_or_create_dm(SECURITY DEFINER)
create policy channels_insert on channels for insert to authenticated
  with check (workspace_id in (select current_workspace_ids()));
create policy channels_update on channels for update to authenticated
  using (workspace_id in (select current_workspace_ids()))
  with check (workspace_id in (select current_workspace_ids()));
create policy channels_delete on channels for delete to authenticated
  using (workspace_id in (select current_workspace_ids()));

-- ─── channel_members (DM 참가자 명단도 멤버만) ───
drop policy ws_isolation on channel_members;

create policy channel_members_select on channel_members for select to authenticated
  using (can_access_channel(channel_id));
-- 쓰기는 SECURITY DEFINER 함수(get_or_create_dm, mark_channel_read) 경유가 정석.
-- 만약을 위해 워크스페이스 범위 내 본인 행만 직접 쓰기 허용.
create policy channel_members_write on channel_members for insert to authenticated
  with check (workspace_id in (select current_workspace_ids()) and user_id = auth.uid());
create policy channel_members_update on channel_members for update to authenticated
  using (workspace_id in (select current_workspace_ids()) and user_id = auth.uid())
  with check (workspace_id in (select current_workspace_ids()) and user_id = auth.uid());

-- ─── messages (핵심) ───
drop policy ws_isolation on messages;

-- 채널 메시지는 채널 접근 가능자만, 레코드 첨부 스레드(channel_id null)는 워크스페이스 공개
create policy messages_select on messages for select to authenticated
  using (
    case when channel_id is null
      then workspace_id in (select current_workspace_ids())
      else can_access_channel(channel_id)
    end
  );
create policy messages_insert on messages for insert to authenticated
  with check (
    workspace_id in (select current_workspace_ids())
    and (channel_id is null or can_access_channel(channel_id))
  );
create policy messages_update on messages for update to authenticated
  using (
    workspace_id in (select current_workspace_ids())
    and (channel_id is null or can_access_channel(channel_id))
  )
  with check (workspace_id in (select current_workspace_ids()));
create policy messages_delete on messages for delete to authenticated
  using (
    workspace_id in (select current_workspace_ids())
    and (channel_id is null or can_access_channel(channel_id))
  );

-- ─── message_mentions (부모 메시지가 보일 때만) ───
drop policy ws_isolation on message_mentions;

create policy message_mentions_select on message_mentions for select to authenticated
  using (exists (select 1 from messages m where m.id = message_mentions.message_id));
create policy message_mentions_insert on message_mentions for insert to authenticated
  with check (
    workspace_id in (select current_workspace_ids())
    and exists (select 1 from messages m where m.id = message_id)
  );
create policy message_mentions_delete on message_mentions for delete to authenticated
  using (exists (select 1 from messages m where m.id = message_mentions.message_id));

-- ─── message_reactions (부모 메시지가 보일 때만, 본인 반응만 쓰기) ───
drop policy ws_isolation on message_reactions;

create policy message_reactions_select on message_reactions for select to authenticated
  using (exists (select 1 from messages m where m.id = message_reactions.message_id));
create policy message_reactions_insert on message_reactions for insert to authenticated
  with check (
    workspace_id in (select current_workspace_ids())
    and user_id = auth.uid()
    and exists (select 1 from messages m where m.id = message_id)
  );
create policy message_reactions_delete on message_reactions for delete to authenticated
  using (workspace_id in (select current_workspace_ids()) and user_id = auth.uid());
