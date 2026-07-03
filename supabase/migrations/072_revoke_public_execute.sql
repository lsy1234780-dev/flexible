-- 072: SECURITY DEFINER 함수의 PUBLIC EXECUTE 회수
--
-- 071에서 anon 롤 회수만으로는 부족 — Postgres 함수는 기본으로 PUBLIC에 EXECUTE가 있어
-- anon이 PUBLIC을 통해 여전히 실행 가능했다. authenticated/service_role에는
-- 명시 grant가 이미 존재하므로 PUBLIC 회수가 앱 동작에 영향 없음.

revoke execute on function can_access_channel(uuid) from public;
revoke execute on function cancel_order_with_stock_restore(uuid) from public;
revoke execute on function chat_user_name(uuid) from public;
revoke execute on function confirm_order_with_stock_deduction(uuid) from public;
revoke execute on function create_order_with_stock_deduction(uuid, jsonb) from public;
revoke execute on function create_order_with_stock_deduction(uuid, jsonb, text) from public;
revoke execute on function create_workspace_for_user(text, text) from public;
revoke execute on function current_workspace_ids() from public;
revoke execute on function get_channel_unreads() from public;
revoke execute on function get_my_channels() from public;
revoke execute on function get_my_mentions(int) from public;
revoke execute on function get_or_create_dm(uuid) from public;
revoke execute on function get_or_create_record_channel(uuid, text, uuid, text) from public;
revoke execute on function get_record_activity(int) from public;
revoke execute on function get_user_email(uuid) from public;
revoke execute on function get_workspace_members() from public;
revoke execute on function get_workspace_users() from public;
revoke execute on function mark_channel_read(uuid) from public;
revoke execute on function restore_order_stock(uuid) from public;
revoke execute on function rls_auto_enable() from public;
revoke execute on function seed_default_channels(uuid) from public;
revoke execute on function seed_default_deal_stages(uuid) from public;
revoke execute on function set_user_app_role(uuid, text, text) from public;
revoke execute on function set_workspace_module(text, boolean) from public;

-- 신규 SECURITY DEFINER 함수 작성 시 체크리스트 (다음부터 이 패턴 유지):
--   revoke execute on function <fn> from public, anon;
--   grant execute on function <fn> to authenticated, service_role;
