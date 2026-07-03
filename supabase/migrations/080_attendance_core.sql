-- 080: 근태 모듈 코어 (attendance)
--
-- 설계 원칙 (docs/architecture/HR.md):
--   "기록·원장 = 안전, 판정·단정 = 법" — 출퇴근 시각을 기록하고 산수만 한다.
--   법적 의미가 있는 숫자(주간 상한 등)는 전부 회사가 입력한 설정값이고, 코드는 그 값대로 비교만 한다.
--
-- 관리자 판정 (2026-07 오너 결정):
--   직급(RBAC)도 workspace_members.role도 아닌 "명시적 권한 부여".
--   attendance_managers에 등록된 사람만 팀 조회·정책 설정 가능.
--   단, 워크스페이스 owner는 락아웃 방지 fallback으로 항상 관리자 권한을 가진다
--   (인사팀 없는 소기업: 사장이 첫 관리자를 지정할 수 있어야 함).

-- ─── 근태 관리자 (명시적 권한 부여) ───
create table attendance_managers (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_by_name text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index idx_attendance_managers_user on attendance_managers(user_id);

-- helper: 현재 유저가 이 워크스페이스의 근태 관리자인가 (owner는 fallback)
create or replace function is_attendance_manager(p_ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from attendance_managers
    where workspace_id = p_ws and user_id = auth.uid()
  ) or exists (
    select 1 from workspace_members
    where workspace_id = p_ws and user_id = auth.uid() and role = 'owner'
  )
$$;

revoke execute on function is_attendance_manager(uuid) from public, anon;
grant execute on function is_attendance_manager(uuid) to authenticated, service_role;

-- ─── 근태 정책 (workspace당 1행 — 값은 회사가 노무사와 정해서 입력) ───
create table attendance_policy (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  punch_method text not null default 'button' check (punch_method in ('button', 'ip', 'gps')),
  allowed_ips text[],                 -- punch_method='ip'일 때 (v2)
  gps_lat double precision,           -- punch_method='gps'일 때 (v2)
  gps_lng double precision,
  gps_radius_m integer,
  standard_start time not null default '09:00',
  standard_end time not null default '18:00',
  break_minutes integer not null default 60,
  work_days integer[] not null default '{1,2,3,4,5}',  -- 0=일 ~ 6=토
  weekly_max_minutes integer,         -- 넘으면 "알림"만 (위반 판정 아님). null = 알림 없음
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- ─── 출퇴근 기록 (하루 한 행) ───
create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  work_type text not null default 'office' check (work_type in ('office', 'remote', 'field')),
  worked_minutes integer,             -- (out - in) - break_minutes, 산수 결과 저장
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, work_date)
);
create index idx_att_records_ws_date on attendance_records(workspace_id, work_date desc);
create index idx_att_records_user_date on attendance_records(user_id, work_date desc);

-- ─── 공휴일 (회사가 직접 등록 — 매년 갱신 책임을 우리가 지지 않음) ───
create table holidays (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, holiday_date)
);
create index idx_holidays_ws_date on holidays(workspace_id, holiday_date);

-- ─── RLS ───
alter table attendance_managers enable row level security;
alter table attendance_policy enable row level security;
alter table attendance_records enable row level security;
alter table holidays enable row level security;

-- 관리자 목록: 멤버 전체 조회 가능(누가 관리자인지 투명), 부여/회수는 관리자(=owner 포함)만
create policy attendance_managers_select on attendance_managers for select
  using (workspace_id in (select current_workspace_ids()));
create policy attendance_managers_insert on attendance_managers for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and is_attendance_manager(workspace_id)
    and granted_by = (select auth.uid())
  );
create policy attendance_managers_delete on attendance_managers for delete
  using (is_attendance_manager(workspace_id));

-- 정책: 멤버 전체 읽기(내 출퇴근 기준 시간을 알아야 함), 쓰기는 관리자만
create policy attendance_policy_select on attendance_policy for select
  using (workspace_id in (select current_workspace_ids()));
create policy attendance_policy_insert on attendance_policy for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and is_attendance_manager(workspace_id)
  );
create policy attendance_policy_update on attendance_policy for update
  using (is_attendance_manager(workspace_id))
  with check (is_attendance_manager(workspace_id));

-- 출퇴근 기록: 본인 것 + 관리자는 팀 전체 (service role 우회 없이 anon+RLS로)
create policy attendance_records_select on attendance_records for select
  using (
    workspace_id in (select current_workspace_ids())
    and (user_id = (select auth.uid()) or is_attendance_manager(workspace_id))
  );
create policy attendance_records_insert on attendance_records for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and user_id = (select auth.uid())
  );
create policy attendance_records_update on attendance_records for update
  using (
    workspace_id in (select current_workspace_ids())
    and (user_id = (select auth.uid()) or is_attendance_manager(workspace_id))
  )
  with check (
    workspace_id in (select current_workspace_ids())
    and (user_id = (select auth.uid()) or is_attendance_manager(workspace_id))
  );

-- 공휴일: 멤버 전체 읽기, 쓰기는 관리자만
create policy holidays_select on holidays for select
  using (workspace_id in (select current_workspace_ids()));
create policy holidays_insert on holidays for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and is_attendance_manager(workspace_id)
  );
create policy holidays_delete on holidays for delete
  using (is_attendance_manager(workspace_id));
