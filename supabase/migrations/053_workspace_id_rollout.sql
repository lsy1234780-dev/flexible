-- 053: 멀티테넌시 Phase 1 — 전 테이블 workspace_id 추가 + 백필 (nullable, RLS는 Phase 3에서)

-- 1) 기본 워크스페이스 생성 (기존 데이터 귀속 대상)
insert into workspaces (id, name, slug, plan)
values ('a0000000-0000-4000-8000-000000000001', 'Flexible (dev)', 'flexible', 'premium');

-- 2) 38개 테넌트 테이블에 workspace_id 추가 + 백필 (동적 루프)
do $$
declare
  t text;
  ws constant uuid := 'a0000000-0000-4000-8000-000000000001';
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
    execute format('alter table public.%I add column if not exists workspace_id uuid references workspaces(id) on delete cascade', t);
    execute format('update public.%I set workspace_id = %L where workspace_id is null', t, ws);
    execute format('create index if not exists idx_%s_workspace on public.%I (workspace_id)', t, t);
  end loop;
end $$;

-- 3) 특수 PK 테이블: workspace_id를 PK에 포함 (NOT NULL 선행 필요)
--    departments / positions / menu_access_rules / system_settings
alter table departments alter column workspace_id set not null;
alter table departments drop constraint departments_pkey;
alter table departments add primary key (workspace_id, id);

alter table positions alter column workspace_id set not null;
alter table positions drop constraint positions_pkey;
alter table positions add primary key (workspace_id, id);

alter table menu_access_rules alter column workspace_id set not null;
alter table menu_access_rules drop constraint menu_access_rules_pkey;
alter table menu_access_rules add primary key (workspace_id, menu_href);

alter table system_settings alter column workspace_id set not null;
alter table system_settings drop constraint system_settings_pkey;
alter table system_settings add primary key (workspace_id, key);

-- 4) 기존 auth 유저를 기본 워크스페이스 멤버(owner)로 등록 (없으면 0건)
insert into workspace_members (workspace_id, user_id, role)
select 'a0000000-0000-4000-8000-000000000001', id, 'owner' from auth.users
on conflict (workspace_id, user_id) do nothing;

-- 5) 기본 워크스페이스 모듈 시드 (기존 ERP 기능 = ON, 미구현 = OFF)
insert into workspace_modules (workspace_id, module_key, enabled) values
  ('a0000000-0000-4000-8000-000000000001','platform',true),
  ('a0000000-0000-4000-8000-000000000001','partners',true),
  ('a0000000-0000-4000-8000-000000000001','products',true),
  ('a0000000-0000-4000-8000-000000000001','quotations',true),
  ('a0000000-0000-4000-8000-000000000001','orders',true),
  ('a0000000-0000-4000-8000-000000000001','inventory',true),
  ('a0000000-0000-4000-8000-000000000001','serials',true),
  ('a0000000-0000-4000-8000-000000000001','receiving',true),
  ('a0000000-0000-4000-8000-000000000001','purchasing',true),
  ('a0000000-0000-4000-8000-000000000001','supply',true),
  ('a0000000-0000-4000-8000-000000000001','fulfillment',true),
  ('a0000000-0000-4000-8000-000000000001','service',true),
  ('a0000000-0000-4000-8000-000000000001','crm_basic',true),
  ('a0000000-0000-4000-8000-000000000001','analytics',true),
  ('a0000000-0000-4000-8000-000000000001','b2b_portal',true),
  ('a0000000-0000-4000-8000-000000000001','crm_pipeline',false),
  ('a0000000-0000-4000-8000-000000000001','chat',false),
  ('a0000000-0000-4000-8000-000000000001','ecommerce',false),
  ('a0000000-0000-4000-8000-000000000001','pos',false),
  ('a0000000-0000-4000-8000-000000000001','warranty',false);
