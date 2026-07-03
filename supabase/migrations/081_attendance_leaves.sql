-- 081: 근태 모듈 — 휴가 (leave_types / leave_requests / leave_balances)
--
-- 원칙 (docs/architecture/HR.md):
--   연차 자동 산정 안 함 — 부여량(granted)은 관리자가 입력, 우리는 차감 산수만.
--   승인은 approvals 재사용(entity_type='leave') — 결재선·인박스·무결성 트리거가 공짜.
--   used는 저장하지 않는다: 승인된 leave_requests에서 계산 (동기화 버그 원천 차단).

-- ─── 휴가 종류 (회사 정의) ───
create table leave_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  deducts_annual boolean not null default true,  -- 연차에서 차감하는가
  day_weight numeric not null default 1,         -- 반차 = 0.5
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_leave_types_ws on leave_types(workspace_id, sort_order);

-- ─── 휴가 신청 ───
create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,                     -- 표시용 스냅샷 (부재 현황판)
  leave_type_id uuid not null references leave_types(id),
  start_date date not null,
  end_date date not null,
  days numeric not null,              -- 근무일 기준 산수 결과 (주말·공휴일 제외 × day_weight)
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index idx_leave_requests_ws_dates on leave_requests(workspace_id, start_date, end_date);
create index idx_leave_requests_user on leave_requests(user_id, created_at desc);
create index idx_leave_requests_type on leave_requests(leave_type_id);

-- ─── 연차 잔여 (부여량은 관리자 입력 — 자동 산정 안 함) ───
create table leave_balances (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null,
  granted numeric not null default 0,  -- 관리자 입력 (라벨도 "부여 (관리자 입력)"으로 중립 표기)
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, year)
);

-- ─── 기본 휴가 종류 시드 (멱등, deal_stages 시드와 같은 패턴) ───
create or replace function seed_default_leave_types(p_ws uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 멤버십 가드 (074 패턴)
  if not exists (
    select 1 from workspace_members where workspace_id = p_ws and user_id = auth.uid()
  ) then
    raise exception 'not a member of workspace';
  end if;

  if exists (select 1 from leave_types where workspace_id = p_ws) then
    return;
  end if;

  insert into leave_types (workspace_id, name, deducts_annual, day_weight, sort_order) values
    (p_ws, '연차', true, 1, 0),
    (p_ws, '반차', true, 0.5, 1),
    (p_ws, '병가', false, 1, 2),
    (p_ws, '경조사', false, 1, 3);
end;
$$;

revoke execute on function seed_default_leave_types(uuid) from public, anon;
grant execute on function seed_default_leave_types(uuid) to authenticated, service_role;

-- ─── 승인(approvals) → 휴가 상태 동기화 트리거 ───
-- decideApproval(범용 승인 UI)이 approvals만 갱신해도 휴가 신청 상태가 따라간다.
-- 앱 코드 경로와 무관하게 DB에서 보장 (수주/구매발주 확정 게이트와 달리 휴가는 승인 = 최종 상태).
create or replace function sync_leave_request_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entity_type = 'leave'
     and old.status = 'pending'
     and new.status in ('approved', 'rejected') then
    -- 아래 guard 트리거에 "동기화 경유"임을 알림 (트랜잭션 로컬)
    perform set_config('app.leave_sync', '1', true);
    update leave_requests
      set status = new.status
      where id = new.entity_id and status = 'pending';
    perform set_config('app.leave_sync', '0', true);
  end if;
  return new;
end;
$$;

create trigger approvals_sync_leave
  after update on approvals
  for each row execute function sync_leave_request_approval();

-- ─── 휴가 신청 무결성 가드 (approvals_guard_update와 같은 철학) ───
-- 요청자가 자기 신청을 'approved'로 바꿔치기하는 것을 차단.
-- 허용 전이:
--   ① 동기화 트리거 경유: pending → approved/rejected
--   ② 그 외(요청자 본인, RLS로 이미 본인 행만): pending → cancelled 만, 다른 컬럼 불변
create or replace function leave_requests_guard_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.leave_sync', true), '0') = '1' then
    if old.status = 'pending' and new.status in ('approved', 'rejected') then
      return new;
    end if;
    raise exception 'invalid leave sync transition';
  end if;

  if old.status = 'pending' and new.status = 'cancelled'
     and new.user_id = old.user_id
     and new.leave_type_id = old.leave_type_id
     and new.start_date = old.start_date
     and new.end_date = old.end_date
     and new.days = old.days then
    return new;
  end if;

  raise exception '휴가 신청은 대기 상태에서 취소만 가능합니다';
end;
$$;

create trigger leave_requests_guard
  before update on leave_requests
  for each row execute function leave_requests_guard_update();

-- ─── RLS ───
alter table leave_types enable row level security;
alter table leave_requests enable row level security;
alter table leave_balances enable row level security;

-- 휴가 종류: 멤버 전체 읽기, 쓰기는 관리자만
create policy leave_types_select on leave_types for select
  using (workspace_id in (select current_workspace_ids()));
create policy leave_types_insert on leave_types for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and is_attendance_manager(workspace_id)
  );
create policy leave_types_update on leave_types for update
  using (is_attendance_manager(workspace_id))
  with check (is_attendance_manager(workspace_id));
create policy leave_types_delete on leave_types for delete
  using (is_attendance_manager(workspace_id));

-- 휴가 신청: 멤버 전체 읽기 (부재 현황판·신청 시 충돌 표시 — approvals와 같은 투명성 철학)
--            생성은 본인, 수정은 본인(전이는 guard 트리거가 제한)
create policy leave_requests_select on leave_requests for select
  using (workspace_id in (select current_workspace_ids()));
create policy leave_requests_insert on leave_requests for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and user_id = (select auth.uid())
  );
create policy leave_requests_update on leave_requests for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 연차 잔여: 본인 것 + 관리자는 팀 전체, 쓰기(부여 입력)는 관리자만
create policy leave_balances_select on leave_balances for select
  using (
    workspace_id in (select current_workspace_ids())
    and (user_id = (select auth.uid()) or is_attendance_manager(workspace_id))
  );
create policy leave_balances_insert on leave_balances for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and is_attendance_manager(workspace_id)
  );
create policy leave_balances_update on leave_balances for update
  using (is_attendance_manager(workspace_id))
  with check (is_attendance_manager(workspace_id));
