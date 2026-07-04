-- 090: 초과근무 사전 신청·승인 — docs/architecture/HR.md v2 (오너 확정 2026-07-04)
--
-- 시작~종료 시각 방식 (오너 결정): 야간근로(22시 이후) 구분 등은 급여SW가 시각을 보고 판단.
-- 우리는 신청·승인 "기록"과 분 단위 "산수"만 — 수당 계산·인정 판정은 하지 않는다.
-- "사전승인 없으면 불인정" 같은 강제도 걸지 않는다: 신청 기록과 실제 출퇴근 기록을 나란히 보여줄 뿐.
--
-- 결재: approvals 재사용(entity_type='overtime') — leave(081)와 동일 패턴.

create table overtime_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,                       -- 표시용 스냅샷
  work_date date not null,              -- 초과근무 하는 날
  start_at timestamptz not null,        -- 예정 시작
  end_at timestamptz not null,          -- 예정 종료 (자정 넘어가면 다음날 시각)
  planned_minutes integer not null check (planned_minutes > 0), -- (end-start) 분 — 서버 계산
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index idx_overtime_ws_date on overtime_requests(workspace_id, work_date);
create index idx_overtime_user on overtime_requests(user_id, work_date desc);

-- ─── 승인(approvals) → 상태 동기화 (leave와 동일 패턴) ───
create or replace function sync_overtime_request_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entity_type = 'overtime'
     and old.status = 'pending'
     and new.status in ('approved', 'rejected') then
    perform set_config('app.overtime_sync', '1', true);
    update overtime_requests
      set status = new.status
      where id = new.entity_id and status = 'pending';
    perform set_config('app.overtime_sync', '0', true);
  end if;
  return new;
end;
$$;

create trigger approvals_sync_overtime
  after update on approvals
  for each row execute function sync_overtime_request_approval();

revoke execute on function sync_overtime_request_approval() from public, anon, authenticated;

-- ─── 무결성 가드 — 요청자가 자기 신청을 approved로 바꿔치기하는 것 차단 ───
create or replace function overtime_requests_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.overtime_sync', true), '0') = '1' then
    if old.status = 'pending' and new.status in ('approved', 'rejected') then
      return new;
    end if;
    raise exception 'invalid overtime sync transition';
  end if;

  if old.status = 'pending' and new.status = 'cancelled'
     and new.user_id = old.user_id
     and new.work_date = old.work_date
     and new.start_at = old.start_at
     and new.end_at = old.end_at
     and new.planned_minutes = old.planned_minutes then
    return new;
  end if;

  raise exception '초과근무 신청은 대기 상태에서 취소만 가능합니다';
end;
$$;

create trigger overtime_requests_guard
  before update on overtime_requests
  for each row execute function overtime_requests_guard_update();

revoke execute on function overtime_requests_guard_update() from public, anon, authenticated;

-- ─── RLS ───
alter table overtime_requests enable row level security;

-- 읽기: 멤버 전체 (leave와 같은 투명성 — 팀 현황·집계, approvals 라벨도 이미 공개)
create policy overtime_requests_select on overtime_requests for select
  using (workspace_id in (select current_workspace_ids()));
create policy overtime_requests_insert on overtime_requests for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and user_id = (select auth.uid())
    and status = 'pending'
  );
create policy overtime_requests_update on overtime_requests for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
