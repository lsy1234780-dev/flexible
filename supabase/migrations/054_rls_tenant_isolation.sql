-- 054: 멀티테넌시 Phase 3 — RLS 워크스페이스 격리
-- 각 테넌트 테이블의 기존 정책 전부 제거 → 워크스페이스 스코프 단일 정책으로 통일
-- (service role은 RLS 우회하므로 서버액션 쓰기는 영향 없음. 이건 유저세션 경로 격리)

do $$
declare
  t text;
  pol record;
  tables text[] := array[
    'products','categories','companies','company_products',
    'quotations','quotation_items','orders','order_items',
    'shipments','shipment_serials','receiving_orders','receiving_items','receiving_staging',
    'inventory_items','inventory_movements','product_lots',
    'inbound_shipments','inbound_shipment_items','inbound_shipment_events',
    'purchase_orders','purchase_order_items','purchase_order_payments',
    'warehouses','warehouse_locations','warehouse_inventory',
    'as_requests','as_logs','crm_logs',
    'inventory_logs','access_logs',
    'role_groups','user_role_groups','menu_access_rules','departments','positions',
    'system_settings','pl_statements','pl_statement_items'
  ];
begin
  foreach t in array tables loop
    -- 기존 정책 모두 제거
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    -- 워크스페이스 격리 단일 정책 (authenticated 유저 세션 대상)
    execute format(
      'create policy ws_isolation on public.%I for all to authenticated '
      || 'using (workspace_id in (select current_workspace_ids())) '
      || 'with check (workspace_id in (select current_workspace_ids()))', t);
  end loop;
end $$;
