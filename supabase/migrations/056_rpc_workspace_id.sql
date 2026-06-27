-- 056: 멀티테넌시 — SECURITY DEFINER/INVOKER RPC가 workspace_id를 채우도록 수정
--
-- 배경: 055에서 inventory_items/orders/order_items의 workspace_id가 NOT NULL이 되면서,
-- 내부에서 이 테이블에 INSERT하던 RPC가 깨짐. workspace_id를 파라미터로 받지 않고
-- 부모 행(products / companies)에서 내부 파생 → 함수 시그니처 불변 → 앱 코드 무수정.
--
-- 점검 결과 실제로 INSERT 때문에 깨지는 함수는 2개뿐:
--   - generate_inventory_items   → inventory_items
--   - create_order_with_stock_deduction (오버로드 2개) → orders, order_items
-- confirm/cancel/restore_order_*는 UPDATE만 하므로 영향 없음(수정 불필요).
-- generate_product_serials(3-arg)는 존재하지 않는 product_serials를 참조하는 죽은 레거시(무시).

-- ── 1) generate_inventory_items: products.workspace_id를 파생해 inventory_items에 주입 ──
create or replace function public.generate_inventory_items(
  p_product_id uuid,
  p_quantity integer,
  p_receiving_item_id uuid default null,
  p_lot_id uuid default null,
  p_generate_unit_barcode boolean default true,
  p_warehouse_id uuid default null,
  p_location_id uuid default null
)
returns table(item_id uuid, unit_barcode text, serial_number integer)
language plpgsql
set search_path = public
as $function$
declare
  v_base_barcode text;
  v_serial_mode text;
  v_ws uuid;
  v_next_serial integer;
  v_i integer;
  v_unit_barcode text;
  v_item_id uuid;
begin
  select barcode, serial_mode, workspace_id
    into v_base_barcode, v_serial_mode, v_ws
    from products where id = p_product_id;
  if v_base_barcode is null then raise exception 'PRODUCT_NOT_FOUND: 제품을 찾을 수 없습니다'; end if;

  if v_serial_mode = 'none' then
    for v_i in 1..p_quantity loop
      v_item_id := gen_random_uuid();
      insert into inventory_items (id, product_id, serial_number, unit_barcode, receiving_item_id, lot_id, warehouse_id, location_id, status, workspace_id)
      values (v_item_id, p_product_id, null, null, p_receiving_item_id, p_lot_id, p_warehouse_id, p_location_id, 'in_stock', v_ws);
      item_id := v_item_id; unit_barcode := null; serial_number := null; return next;
    end loop;
    return;
  end if;

  select coalesce(max(sub.serial_number), 0) into v_next_serial
  from (select ii.serial_number from inventory_items ii where ii.product_id = p_product_id and ii.serial_number is not null for update) sub;

  for v_i in 1..p_quantity loop
    v_next_serial := v_next_serial + 1;
    if p_generate_unit_barcode then v_unit_barcode := v_base_barcode || '-' || lpad(v_next_serial::text, 4, '0'); else v_unit_barcode := null; end if;
    v_item_id := gen_random_uuid();
    insert into inventory_items (id, product_id, serial_number, unit_barcode, receiving_item_id, lot_id, warehouse_id, location_id, status, workspace_id)
    values (v_item_id, p_product_id, v_next_serial, v_unit_barcode, p_receiving_item_id, p_lot_id, p_warehouse_id, p_location_id, 'in_stock', v_ws);
    item_id := v_item_id; unit_barcode := v_unit_barcode; serial_number := v_next_serial; return next;
  end loop;
end; $function$;

-- ── 2) create_order_with_stock_deduction (2-arg): companies.workspace_id 파생 ──
create or replace function public.create_order_with_stock_deduction(p_company_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_order_id uuid; v_item jsonb; v_stock integer; v_prod_name text; v_ws uuid;
begin
  select workspace_id into v_ws from companies where id = p_company_id;
  if v_ws is null then raise exception 'COMPANY_NOT_FOUND:%', p_company_id; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select base_stock, name into v_stock, v_prod_name from products where id = (v_item->>'product_id')::uuid;
    if not found then raise exception 'PRODUCT_NOT_FOUND:%', v_item->>'product_id'; end if;
    if v_stock < (v_item->>'quantity')::integer then raise exception 'STOCK_ERROR:%:% (가용 %개)', v_prod_name, v_item->>'product_id', v_stock; end if;
  end loop;

  insert into orders (company_id, status, workspace_id) values (p_company_id, 'pending', v_ws) returning id into v_order_id;
  insert into order_items (order_id, product_id, quantity, unit_price, workspace_id)
  select v_order_id, (item->>'product_id')::uuid, (item->>'quantity')::integer, (item->>'unit_price')::numeric, v_ws
    from jsonb_array_elements(p_items) as item;
  return jsonb_build_object('order_id', v_order_id);
end; $function$;

-- ── 3) create_order_with_stock_deduction (3-arg, with notes): companies.workspace_id 파생 ──
create or replace function public.create_order_with_stock_deduction(p_company_id uuid, p_items jsonb, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_order_id uuid; v_item jsonb; v_stock integer; v_prod_name text; v_ws uuid;
begin
  select workspace_id into v_ws from companies where id = p_company_id;
  if v_ws is null then raise exception 'COMPANY_NOT_FOUND:%', p_company_id; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select base_stock, name into v_stock, v_prod_name from products where id = (v_item->>'product_id')::uuid;
    if not found then raise exception 'PRODUCT_NOT_FOUND:%', v_item->>'product_id'; end if;
    if v_stock < (v_item->>'quantity')::integer then raise exception 'STOCK_ERROR:%:% (가용 %개)', v_prod_name, v_item->>'product_id', v_stock; end if;
  end loop;

  insert into orders (company_id, status, notes, workspace_id) values (p_company_id, 'pending', p_notes, v_ws) returning id into v_order_id;
  insert into order_items (order_id, product_id, quantity, unit_price, workspace_id)
  select v_order_id, (item->>'product_id')::uuid, (item->>'quantity')::integer, (item->>'unit_price')::numeric, v_ws
    from jsonb_array_elements(p_items) as item;
  return jsonb_build_object('order_id', v_order_id);
end; $function$;
