-- 066: 내 멘션 알림 — 나(@user)를 멘션한 메시지 + 안읽음 여부
--
-- 채널 last_read_at 기준으로 is_unread 계산(읽음 상태 재사용).
-- RLS 우회가 아니라 auth.uid() 기반으로 "나를 멘션한" 것만 추리는 헬퍼.

create or replace function get_my_mentions(p_limit int default 20)
returns table (
  message_id uuid,
  channel_id uuid,
  channel_name text,
  channel_kind text,
  author_name text,
  body text,
  created_at timestamptz,
  is_unread boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, m.channel_id, c.name, c.kind, m.author_name, m.body, m.created_at,
    (m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)) as is_unread
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
