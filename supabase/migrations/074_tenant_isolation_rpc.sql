-- 074: 멀티테넌시 감사 후속 — RPC 테넌트 가드 + record 채널 접근 허용
--
-- 감사에서 발견된 크로스테넌트 구멍 (모두 SECURITY DEFINER, authenticated 호출 가능):
--   ① confirm_order_with_stock_deduction — 워크스페이스 검증 없음
--      → 타 테넌트가 주문 uuid로 남의 주문 확정 + 재고 차감 가능
--   ② cancel_order_with_stock_restore — 동일 (취소 + 재고 복원 조작)
--   ③ restore_order_stock — 검증도 상태 가드도 없음 → 반복 호출로 재고 무한 증식 가능.
--      앱 어디서도 사용하지 않는 죽은 경로 → authenticated 실행 회수
--   ④ seed_default_channels / seed_default_deal_stages — 임의 워크스페이스에 시드 삽입 가능
--
-- 추가: can_access_channel이 kind='record'(070 레코드 스레드)를 몰라서
--       레코드 스레드의 조회/전송/첨부가 RLS에 막힘 → record 허용 (워크스페이스 스코프).

-- ─── can_access_channel: record 채널 허용 ───
-- 공개 채널·레코드 스레드는 워크스페이스 멤버 전체, DM은 멤버만.
create or replace function can_access_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from channels c
    where c.id = p_channel
      and c.workspace_id in (select current_workspace_ids())
      and (
        c.kind in ('channel', 'record')
        or exists (select 1 from channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid())
      )
  );
$$;

-- ─── 주문 상태 전이 RPC: 테넌트 가드 ───
-- 호출자가 service_role이 아니면, 주문이 내 워크스페이스 소속인지 검증.
-- 존재 여부를 노출하지 않도록 실패는 동일하게 ORDER_NOT_FOUND.

create or replace function confirm_order_with_stock_deduction(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
DECLARE v_status text; v_item record; v_stock integer; v_prod_name text;
BEGIN
  IF (select auth.role()) is distinct from 'service_role' AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = p_order_id AND o.workspace_id IN (SELECT current_workspace_ids())
  ) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_status != 'pending' THEN RAISE EXCEPTION 'INVALID_STATUS:현재 상태(%)에서는 확정할 수 없습니다', v_status; END IF;
  FOR v_item IN SELECT oi.product_id, oi.quantity FROM order_items oi WHERE oi.order_id = p_order_id LOOP
    SELECT base_stock, name INTO v_stock, v_prod_name FROM products WHERE id = v_item.product_id FOR UPDATE;
    IF v_stock < v_item.quantity THEN RAISE EXCEPTION 'STOCK_ERROR:% (가용 %개, 요청 %개)', v_prod_name, v_stock, v_item.quantity; END IF;
    UPDATE products SET base_stock = base_stock - v_item.quantity WHERE id = v_item.product_id;
  END LOOP;
  UPDATE orders SET status = 'confirmed', confirmed_at = now() WHERE id = p_order_id;
END;
$$;

create or replace function cancel_order_with_stock_restore(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
DECLARE v_status text;
BEGIN
  IF (select auth.role()) is distinct from 'service_role' AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = p_order_id AND o.workspace_id IN (SELECT current_workspace_ids())
  ) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_status = 'confirmed' THEN
    UPDATE products p SET base_stock = p.base_stock + oi.quantity FROM order_items oi WHERE oi.order_id = p_order_id AND oi.product_id = p.id;
  END IF;
  IF v_status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'INVALID_STATUS:현재 상태(%)에서는 취소할 수 없습니다', v_status; END IF;
  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;

-- ─── restore_order_stock: 죽은 경로 차단 ───
-- 앱 어디서도 호출하지 않음. 가장 위험(상태 가드 없는 재고 증식)하므로 실행 권한 자체를 회수.
revoke execute on function restore_order_stock(uuid) from authenticated;

-- ─── 주문 생성 RPC: 호출자 검증 ───
-- 허용: service_role(B2B 포털 서버) / 해당 업체가 속한 워크스페이스 멤버 / 그 업체의 B2B 계정 본인
create or replace function create_order_with_stock_deduction(p_company_id uuid, p_items jsonb, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_order_id uuid; v_item jsonb; v_stock integer; v_prod_name text; v_ws uuid; v_auth uuid;
begin
  select workspace_id, auth_user_id into v_ws, v_auth from companies where id = p_company_id;
  if v_ws is null then raise exception 'COMPANY_NOT_FOUND:%', p_company_id; end if;

  if (select auth.role()) is distinct from 'service_role'
     and v_ws not in (select current_workspace_ids())
     and (v_auth is null or v_auth is distinct from auth.uid()) then
    raise exception 'COMPANY_NOT_FOUND:%', p_company_id;
  end if;

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
end;
$$;

-- 2-인자 오버로드는 3-인자 버전으로 위임 (가드 중복 방지)
create or replace function create_order_with_stock_deduction(p_company_id uuid, p_items jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select create_order_with_stock_deduction(p_company_id, p_items, null);
$$;

-- ─── 시드 함수: 워크스페이스 멤버십 가드 ───
create or replace function seed_default_channels(p_ws uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.role()) is distinct from 'service_role'
     and p_ws not in (select current_workspace_ids()) then
    raise exception '워크스페이스 접근 권한이 없습니다';
  end if;
  if exists (select 1 from channels where workspace_id = p_ws) then
    return;
  end if;
  insert into channels (workspace_id, name, kind) values (p_ws, 'general', 'channel');
end;
$$;

create or replace function seed_default_deal_stages(p_ws uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.role()) is distinct from 'service_role'
     and p_ws not in (select current_workspace_ids()) then
    raise exception '워크스페이스 접근 권한이 없습니다';
  end if;
  if exists (select 1 from deal_stages where workspace_id = p_ws) then
    return;
  end if;
  insert into deal_stages (workspace_id, name, sort_order, kind, color) values
    (p_ws, '리드', 0, 'open',  '#94a3b8'),
    (p_ws, '상담', 1, 'open',  '#60a5fa'),
    (p_ws, '견적', 2, 'open',  '#818cf8'),
    (p_ws, '협상', 3, 'open',  '#fbbf24'),
    (p_ws, '계약', 4, 'won',   '#34d399'),
    (p_ws, '실패', 5, 'lost',  '#f87171');
end;
$$;

-- 신규 함수(sql 오버로드 등)에도 071/072 권한 정책 유지
revoke execute on function create_order_with_stock_deduction(uuid, jsonb) from public, anon;
revoke execute on function create_order_with_stock_deduction(uuid, jsonb, text) from public, anon;
