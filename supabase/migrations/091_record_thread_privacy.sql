-- 091: 레코드 스레드 접근 하드닝 — 개인정보(경비 등) 스레드는 본인/담당/승인자만
--
-- 문제:
--   060/063/074에서 record 채널은 kind='record'라는 이유만으로 워크스페이스 전원이 열람 가능했다.
--   그런데 경비(expense)는 083/086에서 "본인 / 재무담당 / 그 건의 승인자"만 보도록 잠근 개인정보다.
--   → 경비 헤더·라인·영수증은 잠겼지만, 그 경비에 달린 "레코드 스레드(대화·첨부)"는 전원에게 샜다.
--     (get_record_activity가 전원 인박스에 노출 + 딥링크로 스레드 직접 열람 가능)
--   수주·제품·거래처·A/S 등 업무 레코드는 원래 팀 공개가 맞으므로 그대로 둔다.
--
-- 해결:
--   접근 판정의 단일 관문 can_access_channel()에 "record 채널은 record_thread_visible()로 판정" 분기를
--   추가한다. 채널/메시지/멤버/멘션/반응/첨부(067 스토리지 포함) 읽기가 전부 이 함수를 타므로
--   한 곳만 고치면 모든 읽기 경로가 닫힌다. + RLS를 우회하는 피드 함수(get_record_activity,
--   get_my_mentions)에도 동일 필터를 건다.
--
-- 롤백: can_access_channel은 074의 정의로, get_record_activity/get_my_mentions는 070의 정의로
--   되돌리고 record_thread_visible을 drop하면 원상복구된다 (데이터 변경 없음, 함수 교체뿐).

-- ─── 레코드 스레드 가시성: 제한 엔티티만 좁히고 나머지는 공개 유지 ───
-- 반환 true = 이 스레드를 봐도 됨. 업무 레코드(수주·제품 등)는 항상 true.
-- 개인정보 레코드(현재 expense; 향후 leave/overtime 자리)는 본인/담당/승인자만 true.
create or replace function record_thread_visible(p_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 경비: 086 술어 재사용 (소유자 / 재무담당 / 이 건의 승인자)
  if p_type = 'expense' then
    return exists (
      select 1 from expense_claims c
      where c.id = p_id
        and (
          c.user_id = auth.uid()
          or is_expense_manager(c.workspace_id)
          or exists (
            select 1 from approvals a
            where a.entity_type = 'expense'
              and a.entity_id = p_id
              and a.approver_id = auth.uid()
          )
        )
    );
  end if;

  -- 그 외(수주·제품·거래처·A/S·견적·창고·입고·구매발주 등) 및 미지정 타입은 공개 유지
  return true;
end;
$$;

revoke execute on function record_thread_visible(text, uuid) from public, anon;
grant execute on function record_thread_visible(text, uuid) to authenticated, service_role;

-- ─── can_access_channel: record 채널은 엔티티 가시성으로 판정 (074 대체) ───
-- 공개 채널=전원, record 채널=record_thread_visible, DM/비공개=채널 멤버.
-- (074에 있던 record의 무조건 허용 + member 폴백을 제거 — 한번 읽어 생긴 channel_members 행으로
--  제한 스레드가 뚫리지 않게 record는 오직 record_thread_visible로만 판정한다.)
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
      and case c.kind
            when 'channel' then true
            when 'record'  then record_thread_visible(c.entity_type, c.entity_id)
            else exists (
              select 1 from channel_members cm
              where cm.channel_id = c.id and cm.user_id = auth.uid()
            )
          end
  );
$$;

-- ─── get_record_activity: 인박스 "레코드 대화" 피드에서 못 보는 스레드 제외 (070 대체) ───
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
    and record_thread_visible(c.entity_type, c.entity_id)
  order by m.created_at desc
  limit p_limit;
$$;

-- ─── get_my_mentions: 멘션도 못 보는 스레드면 숨김 (070 대체) ───
-- (SECURITY DEFINER라 RLS를 우회하므로 여기서도 명시적으로 필터. 비-record 채널은 entity_type이
--  null이라 자동 통과.)
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
    and (c.entity_type is null or record_thread_visible(c.entity_type, c.entity_id))
  order by m.created_at desc
  limit p_limit;
$$;
