-- 승인 워크플로우 — 수주 확정 / 구매발주 확정에 건별 지정 승인자 게이트를 건다.
-- 범용 테이블로 설계(entity_type/entity_id) — RecordThread/moduleRegistry와 같은 패턴.

create table approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  entity_label text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references auth.users(id),
  requested_by_name text,
  approver_id uuid not null references auth.users(id),
  approver_name text,
  note text,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_approvals_entity on approvals(entity_type, entity_id, created_at desc);
create index idx_approvals_approver on approvals(approver_id, status);
create index idx_approvals_workspace on approvals(workspace_id);

alter table approvals enable row level security;

-- 같은 워크스페이스 멤버는 전부 조회 가능 (요청자/승인자/제3자 모두 — 누가 뭘 승인 대기 중인지 투명하게)
create policy approvals_select on approvals for select
  using (workspace_id in (select current_workspace_ids()));

-- 워크스페이스 멤버는 자기 이름으로만 요청 가능
create policy approvals_insert on approvals for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and requested_by = (select auth.uid())
  );

-- 지정된 승인자 본인만 결정(승인/반려) 가능
create policy approvals_update on approvals for update
  using (approver_id = (select auth.uid()))
  with check (approver_id = (select auth.uid()));

-- 구매발주는 지금까지 "확정" 상태 개념이 없었음(수주처럼 pending/confirmed 상태값이 없음) —
-- 승인 게이트를 걸 지점을 만들기 위해 추가.
alter table purchase_orders add column status text not null default 'draft' check (status in ('draft', 'approved'));
