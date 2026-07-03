-- 077에서 만든 approvals의 RLS 2가지 허점 보강 (직접 PostgREST 호출 경로 방어).
--   ① INSERT: 승인자가 같은 워크스페이스 멤버인지 미검증 → 임의 uuid를 승인자로 지정 가능했음
--   ② UPDATE: approver_id = auth.uid()만 검사 → 승인자가 자기 행의 entity_id를 다른 주문으로
--      바꿔치기하거나, 이미 결정된 요청을 다시 뒤집을 수 있었음
-- RLS는 새 행만 보고 OLD와 비교를 못 하므로(불변성 강제 불가), 컬럼 불변성 + 상태 전이는 트리거로 잠근다.

-- ① INSERT: 승인자도 같은 워크스페이스 멤버여야 함.
-- (요청자는 workspace_members_self_read로 자기 워크스페이스 멤버를 볼 수 있어 EXISTS가 정상 동작)
drop policy if exists approvals_insert on approvals;
create policy approvals_insert on approvals for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and requested_by = (select auth.uid())
    and exists (
      select 1 from workspace_members wm
      where wm.workspace_id = approvals.workspace_id
        and wm.user_id = approvals.approver_id
    )
  );

-- ② UPDATE: 지정된 승인자가, pending 상태인 요청만 업데이트 가능.
drop policy if exists approvals_update on approvals;
create policy approvals_update on approvals for update
  using (approver_id = (select auth.uid()) and status = 'pending')
  with check (approver_id = (select auth.uid()));

-- 트리거: 결정 시에만 바뀌어야 하는 3개 컬럼 외 전부 불변 + 상태는 pending→approved/rejected만.
create or replace function approvals_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.entity_type      is distinct from old.entity_type
     or new.entity_id      is distinct from old.entity_id
     or new.entity_label   is distinct from old.entity_label
     or new.workspace_id   is distinct from old.workspace_id
     or new.requested_by   is distinct from old.requested_by
     or new.requested_by_name is distinct from old.requested_by_name
     or new.approver_id    is distinct from old.approver_id
     or new.approver_name  is distinct from old.approver_name
     or new.note           is distinct from old.note
     or new.created_at     is distinct from old.created_at then
    raise exception 'APPROVAL_IMMUTABLE: 승인 요청의 대상/요청자/승인자 정보는 변경할 수 없습니다';
  end if;

  if old.status is distinct from 'pending' then
    raise exception 'APPROVAL_ALREADY_DECIDED: 이미 처리된 승인 요청입니다';
  end if;
  if new.status not in ('approved', 'rejected') then
    raise exception 'APPROVAL_INVALID_STATUS: 승인 또는 반려만 가능합니다';
  end if;

  return new;
end;
$$;

create trigger trg_approvals_guard_update
  before update on approvals
  for each row execute function approvals_guard_update();
