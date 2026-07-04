-- 087: 팀 출근 상태 조회 — 채팅 상시 부재 표시용 (업무 중 / 퇴근 / 출근 전)
--
-- attendance_records는 RLS로 본인+근태 관리자만 조회 가능하다 (출퇴근 "시각"은 민감).
-- 채팅 배지에는 시각이 아니라 상태만 필요하므로, SECURITY DEFINER 함수로
-- "오늘의 상태(working/done)"만 팀 전체에 노출한다 — 몇 시에 출근했는지는 안 보여준다.

create or replace function get_team_clock_states()
returns table (user_id uuid, state text)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.user_id,
    case
      when r.clock_out_at is not null then 'done'
      when r.clock_in_at is not null then 'working'
      else 'none'
    end as state
  from attendance_records r
  where r.workspace_id in (select current_workspace_ids())
    and r.work_date = current_date;
$$;

revoke execute on function get_team_clock_states() from public, anon;
grant execute on function get_team_clock_states() to authenticated, service_role;
