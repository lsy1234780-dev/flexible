-- 092: 보안·성능 하드닝 (어드바이저 후속)
--
-- ① 보안: get_my_mentions는 SECURITY DEFINER인데 anon(비로그인)도 호출 가능했다.
--    auth.uid()가 null이라 실질 유출은 없지만, 비로그인 API 표면을 줄인다 (anon EXECUTE 회수).
-- ② 성능: FK에 커버링 인덱스가 없어 조인·삭제 시 순차스캔이 날 수 있는 9개 컬럼에 인덱스 추가.
--    (지금은 데이터가 적어 무해하지만 커지면 느려지므로 선제적으로.)
--
-- 롤백: drop index ... + get_my_mentions에 anon grant 복구.

-- ─── ① 보안: get_my_mentions anon 호출 차단 ───
-- 주의: 함수는 생성 시 PUBLIC에 EXECUTE가 기본 부여되고 anon은 PUBLIC을 상속하므로
--       from anon만 회수하면 안 막힌다. PUBLIC 회수 + authenticated/service_role 명시 부여 (072 패턴).
revoke execute on function get_my_mentions(int) from public, anon;
grant execute on function get_my_mentions(int) to authenticated, service_role;

-- ─── ② 성능: 미인덱스 FK 커버링 인덱스 ───
create index if not exists idx_approvals_requested_by
  on approvals (requested_by);
create index if not exists idx_attendance_managers_granted_by
  on attendance_managers (granted_by);
create index if not exists idx_attendance_policy_updated_by
  on attendance_policy (updated_by);
create index if not exists idx_expense_claim_items_workspace_id
  on expense_claim_items (workspace_id);
create index if not exists idx_expense_managers_granted_by
  on expense_managers (granted_by);
create index if not exists idx_expense_settlement_batches_created_by
  on expense_settlement_batches (created_by);
create index if not exists idx_leave_balances_updated_by
  on leave_balances (updated_by);
create index if not exists idx_leave_balances_user_id
  on leave_balances (user_id);
create index if not exists idx_member_statuses_user_id
  on member_statuses (user_id);
