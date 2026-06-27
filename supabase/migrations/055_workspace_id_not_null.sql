-- 055: 멀티테넌시 Phase 3 마무리 — workspace_id NOT NULL 잠금
--
-- 배경: 054(RLS)까지 적용됐으나 workspace_id가 nullable로 남아 있었음.
-- 우리 아키텍처는 앱이 service-role(RLS 우회)로 쓰기를 하므로, 코드가 workspace_id를
-- 빠뜨리고 INSERT하면 NULL로 들어가 어떤 워크스페이스에도 안 잡히는 "유령 행"이 생김.
-- 데이터가 0행인 지금이 NOT NULL을 거는 비용 0의 적기. DB를 최후의 안전망으로 만든다.
--
-- 특수 PK 4테이블(departments/positions/menu_access_rules/system_settings)은
-- 053에서 이미 NOT NULL 처리됨 → 여기선 제외.

do $$
declare
  t text;
  null_cnt bigint;
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
    'role_groups','user_role_groups',
    'pl_statements','pl_statement_items'
  ];
begin
  foreach t in array tables loop
    -- 가드: 백필 안 된 NULL 행이 있으면 잠그지 말고 즉시 실패 (데이터 유실 방지)
    execute format('select count(*) from public.%I where workspace_id is null', t) into null_cnt;
    if null_cnt > 0 then
      raise exception '테이블 %는 workspace_id NULL 행 %건이 있어 NOT NULL을 걸 수 없습니다. 백필 먼저 수행하세요.', t, null_cnt;
    end if;
    execute format('alter table public.%I alter column workspace_id set not null', t);
  end loop;
end $$;
