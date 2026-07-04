-- 085: 멤버 부재 표시 (presence-lite) — 채팅·미니채팅에서 "이 사람 지금 없음"을 보여준다
--
-- 두 종류:
--   ① 휴가 — 저장 안 함. 승인된 leave_requests가 오늘을 덮으면 자동 파생 (신청→승인만 하면 표시).
--   ② 자리비움/외근 — 본인이 직접 설정 (member_statuses). 감시 아님: 본인만 쓰고 지울 수 있고,
--      당일(set_on = 오늘)만 유효해서 해제를 잊어도 다음날 자동으로 사라진다.
-- 휴가가 자리비움보다 우선.

create table member_statuses (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,                       -- '자리비움', '외근', '회의 중' 등 자유 입력
  set_on date not null default current_date, -- 이 날짜에만 유효 (다음날 자동 무효)
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table member_statuses enable row level security;

-- 읽기: 워크스페이스 멤버 전체 (부재 여부는 팀에 공개 — 그게 목적)
create policy member_statuses_select on member_statuses for select
  using (workspace_id in (select current_workspace_ids()));

-- 쓰기: 본인 행만
create policy member_statuses_insert on member_statuses for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and user_id = (select auth.uid())
  );
create policy member_statuses_update on member_statuses for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy member_statuses_delete on member_statuses for delete
  using (user_id = (select auth.uid()));

-- ─── get_my_channels: DM 상대 user_id 추가 (부재 배지를 붙이려면 이름이 아니라 id가 필요) ───
-- 반환 컬럼이 늘어나므로 drop 후 재생성 (070과 같은 시그니처 변경 패턴).
drop function if exists get_my_channels();

create or replace function get_my_channels()
returns table (id uuid, name text, kind text, partner_id uuid, partner_name text, unread bigint)
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
    ), 0) as unread
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
