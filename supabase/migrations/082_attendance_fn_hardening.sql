-- 082: 근태 트리거 함수 하드닝 (어드바이저 지적 반영)
--
-- ① sync_leave_request_approval / leave_requests_guard_update는 트리거 전용 —
--    REST RPC로 직접 호출할 이유가 없으므로 EXECUTE 전부 회수 (072 패턴).
-- ② leave_requests_guard_update에 search_path 고정 (071 패턴).

alter function leave_requests_guard_update() set search_path = public;

revoke execute on function sync_leave_request_approval() from public, anon, authenticated;
revoke execute on function leave_requests_guard_update() from public, anon, authenticated;
