-- 071: 보안 강화 — Supabase 어드바이저(security lint) 지적 사항 일괄 해소
--
-- ① inventory_pl_view가 RLS를 우회(SECURITY DEFINER 뷰) → 크로스테넌트 손익 노출 가능 [ERROR]
-- ② search_path 미고정 함수 10개 (search_path 하이재킹 방지) [WARN]
-- ③ SECURITY DEFINER 함수들이 anon 롤에서 실행 가능 [WARN]
--    (모두 auth.uid() 가드가 있어 실익은 없지만, 비로그인 호출 자체를 차단)

-- ─── ① 뷰: 조회자 권한으로 실행 (기저 테이블 ws_isolation RLS 적용) ───
alter view inventory_pl_view set (security_invoker = on);

-- ─── ② 함수 search_path 고정 ───
alter function restore_order_stock(p_order_id uuid) set search_path = public;
alter function confirm_order_with_stock_deduction(p_order_id uuid) set search_path = public;
alter function cancel_order_with_stock_restore(p_order_id uuid) set search_path = public;
alter function generate_order_number() set search_path = public;
alter function generate_product_serials(p_product_id uuid, p_quantity integer, p_receiving_item_id uuid) set search_path = public;
alter function generate_product_serials(p_product_id uuid, p_quantity integer, p_receiving_item_id uuid, p_lot_id uuid, p_generate_unit_barcode boolean) set search_path = public;
alter function update_as_requests_updated_at() set search_path = public;
alter function check_location_hierarchy() set search_path = public;
alter function update_location_full_path() set search_path = public;
alter function update_pl_statement_timestamp() set search_path = public;

-- ─── ③ SECURITY DEFINER 함수: anon 실행 권한 회수 (authenticated는 유지) ───
revoke execute on function can_access_channel(uuid) from anon;
revoke execute on function cancel_order_with_stock_restore(uuid) from anon;
revoke execute on function chat_user_name(uuid) from anon;
revoke execute on function confirm_order_with_stock_deduction(uuid) from anon;
revoke execute on function create_order_with_stock_deduction(uuid, jsonb) from anon;
revoke execute on function create_order_with_stock_deduction(uuid, jsonb, text) from anon;
revoke execute on function create_workspace_for_user(text, text) from anon;
revoke execute on function current_workspace_ids() from anon;
revoke execute on function get_channel_unreads() from anon;
revoke execute on function get_my_channels() from anon;
revoke execute on function get_my_mentions(int) from anon;
revoke execute on function get_or_create_dm(uuid) from anon;
revoke execute on function get_or_create_record_channel(uuid, text, uuid, text) from anon;
revoke execute on function get_record_activity(int) from anon;
revoke execute on function get_user_email(uuid) from anon;
revoke execute on function get_workspace_members() from anon;
revoke execute on function get_workspace_users() from anon;
revoke execute on function mark_channel_read(uuid) from anon;
revoke execute on function restore_order_stock(uuid) from anon;
revoke execute on function rls_auto_enable() from anon;
revoke execute on function seed_default_channels(uuid) from anon;
revoke execute on function seed_default_deal_stages(uuid) from anon;
revoke execute on function set_user_app_role(uuid, text, text) from anon;
revoke execute on function set_workspace_module(text, boolean) from anon;
