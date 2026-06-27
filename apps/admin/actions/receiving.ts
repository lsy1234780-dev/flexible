'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import dayjs from 'dayjs';

// ── 입고지시서 목록 조회 ──

export async function getReceivingOrders() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('receiving_orders')
    .select(`
      id, title, status, memo, created_at, completed_at, confirmed_at,
      receiving_items(
        id, product_id, expected_quantity, received_quantity,
        products(name, barcode)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return data;
}

// ── 입고지시서 생성 (제품 + 수량만, LOT/시리얼은 확정 시 부여) ──

export async function createReceivingOrder(
  title: string,
  items: { product_id: string; expected_quantity: number }[],
  memo?: string,
) {
  const supabase = await createAdminClient();

  if (!title.trim()) return { error: '제목을 입력하세요' };
  if (items.length === 0) return { error: '입고 항목을 추가하세요' };

  const workspaceId = await getCurrentWorkspaceId();

  const { data: order, error: orderErr } = await supabase
    .from('receiving_orders')
    .insert({
      title: title.trim(),
      status: 'pending',
      memo: memo?.trim() || null,
      workspace_id: workspaceId,
    })
    .select('id')
    .single();

  if (orderErr) return { error: orderErr.message };

  const insertItems = items.map((item) => ({
    receiving_order_id: order.id,
    product_id: item.product_id,
    expected_quantity: item.expected_quantity,
    received_quantity: 0,
    workspace_id: workspaceId,
  }));

  const { error: itemsErr } = await supabase
    .from('receiving_items')
    .insert(insertItems);

  if (itemsErr) return { error: itemsErr.message };

  revalidatePath('/receiving');
  return { success: true, id: order.id };
}

// ── 입고지시서 삭제/취소 ──
// pending: 바로 삭제
// in_progress / awaiting_confirmation: 단순 취소 (시리얼/재고 미반영 상태)
// completed: 시리얼 삭제 + 재고 복원

export async function deleteReceivingOrder(id: string) {
  const supabase = await createAdminClient();

  const { data: order } = await supabase
    .from('receiving_orders')
    .select('status, receiving_items(id, product_id, received_quantity)')
    .eq('id', id)
    .single();

  if (!order) return { error: '입고지시서를 찾을 수 없습니다' };

  if (order.status === 'completed') {
    // 확정 완료된 지시서: 시리얼 삭제 + 재고 복원
    const items = order.receiving_items as unknown as {
      id: string; product_id: string; received_quantity: number;
    }[];

    for (const item of items) {
      if (item.received_quantity > 0) {
        await supabase
          .from('inventory_items')
          .delete()
          .eq('receiving_item_id', item.id);

        const { data: product } = await supabase
          .from('products')
          .select('base_stock')
          .eq('id', item.product_id)
          .single();

        if (product) {
          await supabase
            .from('products')
            .update({ base_stock: Math.max(0, product.base_stock - item.received_quantity) })
            .eq('id', item.product_id);
        }
      }
    }

    await supabase
      .from('receiving_orders')
      .update({ status: 'cancelled' })
      .eq('id', id);
  } else if (order.status === 'in_progress' || order.status === 'awaiting_confirmation') {
    // 확정 전: 시리얼/재고 미반영이므로 단순 취소
    await supabase
      .from('receiving_orders')
      .update({ status: 'cancelled' })
      .eq('id', id);
  } else {
    // pending: 바로 삭제 (CASCADE)
    const { error } = await supabase
      .from('receiving_orders')
      .delete()
      .eq('id', id);
    if (error) return { error: error.message };
  }

  revalidatePath('/receiving');
  return { success: true };
}

// ── 입고 확정: 시리얼 입력 + LOT 지정 + 재고 반영 ──

interface ConfirmationItem {
  receiving_item_id: string;
  product_id: string;
  lots: { quantity: number; manufactured_at: string }[];
  manufacturer_serials: string[];
}

interface ConfirmOptions {
  generateUnitBarcode?: boolean;
  warehouse_id?: string | null;
  location_id?: string | null;
}

export async function confirmReceivingOrder(
  orderId: string,
  confirmItems: ConfirmationItem[],
  options?: ConfirmOptions,
) {
  const supabase = await createAdminClient();
  const workspaceId = await getCurrentWorkspaceId();
  const generateBarcode = options?.generateUnitBarcode ?? false;
  const warehouseId = options?.warehouse_id ?? null;
  const locationId = options?.location_id ?? null;

  // 지시서 확인
  const { data: order } = await supabase
    .from('receiving_orders')
    .select('id, title, status')
    .eq('id', orderId)
    .single();

  if (!order) return { error: '입고지시서를 찾을 수 없습니다' };
  if (order.status !== 'awaiting_confirmation') {
    return { error: '확인 대기 상태가 아닙니다' };
  }

  // 항목 조회
  const { data: items } = await supabase
    .from('receiving_items')
    .select('id, product_id, expected_quantity, received_quantity')
    .eq('receiving_order_id', orderId);

  if (!items || items.length === 0) return { error: '입고 항목이 없습니다' };

  // 검증
  for (const ci of confirmItems) {
    const item = items.find((i) => i.id === ci.receiving_item_id);
    if (!item) return { error: `항목을 찾을 수 없습니다: ${ci.receiving_item_id}` };

    const lotTotal = ci.lots.reduce((s, l) => s + l.quantity, 0);
    // 시리얼은 부족/초과 허용 (부족 시 빈 값, 초과 시 잘림)
    if (ci.lots.length > 0 && lotTotal !== item.received_quantity) {
      return { error: `LOT 수량 합(${lotTotal})이 입고 수량(${item.received_quantity})과 일치하지 않습니다` };
    }
  }

  // 항목별 처리
  for (const ci of confirmItems) {
    const item = items.find((i) => i.id === ci.receiving_item_id)!;
    const qty = item.received_quantity;

    // LOT 생성/재사용
    interface LotGroup { lotId: string; quantity: number }
    const lotGroups: LotGroup[] = [];

    for (const lot of ci.lots) {
      const lotNumber = `LOT-${dayjs(lot.manufactured_at).format('YYMMDD')}`;

      // 같은 제품+제조일 LOT 찾기
      const { data: existing } = await supabase
        .from('product_lots')
        .select('id')
        .eq('product_id', ci.product_id)
        .eq('manufactured_at', lot.manufactured_at)
        .single();

      let lotId: string;
      if (existing) {
        lotId = existing.id;
      } else {
        const { data: newLot } = await supabase
          .from('product_lots')
          .insert({
            product_id: ci.product_id,
            lot_number: lotNumber,
            manufactured_at: lot.manufactured_at,
            received_at: dayjs().format('YYYY-MM-DD'),
            quantity: 0,
            workspace_id: workspaceId,
          })
          .select('id')
          .single();
        if (!newLot) return { error: `LOT 생성 실패` };
        lotId = newLot.id;
      }

      lotGroups.push({ lotId, quantity: lot.quantity });

      // LOT 수량 증가
      const { data: lotData } = await supabase
        .from('product_lots')
        .select('quantity')
        .eq('id', lotId)
        .single();
      if (lotData) {
        await supabase
          .from('product_lots')
          .update({ quantity: lotData.quantity + lot.quantity })
          .eq('id', lotId);
      }
    }

    // 시리얼 생성 (RPC로 serial_number/unit_barcode 자동생성)
    const allCreatedItemIds: string[] = [];

    if (ci.lots.length > 0) {
      // LOT별로 시리얼 생성 (LOT 수량에 맞춰 분할)
      let serialIdx = 0;
      for (const lg of lotGroups) {
        const { data: serials, error: serialError } = await supabase.rpc(
          'generate_inventory_items',
          {
            p_product_id: ci.product_id,
            p_quantity: lg.quantity,
            p_receiving_item_id: ci.receiving_item_id,
            p_lot_id: lg.lotId,
            p_generate_unit_barcode: generateBarcode,
            p_warehouse_id: warehouseId,
            p_location_id: locationId,
          },
        );

        if (serialError) return { error: `시리얼 생성 실패: ${serialError.message}` };

        // manufacturer_serial 업데이트
        const serialList = serials as { item_id: string }[];
        for (const s of serialList) {
          allCreatedItemIds.push(s.item_id);
          if (serialIdx < ci.manufacturer_serials.length) {
            await supabase
              .from('inventory_items')
              .update({ manufacturer_serial: ci.manufacturer_serials[serialIdx] })
              .eq('id', s.item_id);
            serialIdx++;
          }
        }
      }
    } else {
      // LOT 없이 시리얼만 생성
      const { data: serials, error: serialError } = await supabase.rpc(
        'generate_inventory_items',
        {
          p_product_id: ci.product_id,
          p_quantity: qty,
          p_receiving_item_id: ci.receiving_item_id,
          p_lot_id: null,
          p_generate_unit_barcode: generateBarcode,
          p_warehouse_id: warehouseId,
          p_location_id: locationId,
        },
      );

      if (serialError) return { error: `시리얼 생성 실패: ${serialError.message}` };

      const serialList = serials as { item_id: string }[];
      for (let i = 0; i < serialList.length; i++) {
        allCreatedItemIds.push(serialList[i].item_id);
        if (i < ci.manufacturer_serials.length) {
          await supabase
            .from('inventory_items')
            .update({ manufacturer_serial: ci.manufacturer_serials[i] })
            .eq('id', serialList[i].item_id);
        }
      }
    }

    // inventory_movements 기록 (입고확정)
    if (allCreatedItemIds.length > 0) {
      await supabase.from('inventory_movements').insert(
        allCreatedItemIds.map((itemId) => ({
          inventory_item_id: itemId,
          product_id: ci.product_id,
          from_status: null,
          to_status: 'in_stock',
          quantity: 1,
          reason: '입고확정',
          memo: `입고지시서: ${order.title ?? orderId}`,
          workspace_id: workspaceId,
        })),
      );
    }

    // 재고 증가
    const { data: product } = await supabase
      .from('products')
      .select('base_stock')
      .eq('id', ci.product_id)
      .single();

    if (product) {
      await supabase
        .from('products')
        .update({ base_stock: product.base_stock + qty })
        .eq('id', ci.product_id);
    }

    // 입고 이력
    await supabase.from('inventory_logs').insert({
      product_id: ci.product_id,
      quantity: qty,
      type: 'in',
      memo: `입고 확정 (시리얼 ${qty}건${ci.lots.length > 0 ? `, LOT ${ci.lots.length}건` : ''})`,
      workspace_id: workspaceId,
    });
  }

  // 부분입고 처리: 미입고분 이월 지시서 생성
  const allFulfilled = items.every((i) => i.received_quantity >= i.expected_quantity);
  const totalExpected = items.reduce((s, i) => s + i.expected_quantity, 0);
  const totalReceived = items.reduce((s, i) => s + i.received_quantity, 0);

  let carryOverId: string | null = null;
  if (!allFulfilled) {
    const shortItems = items
      .filter((i) => i.received_quantity < i.expected_quantity)
      .map((i) => ({
        product_id: i.product_id,
        expected_quantity: i.expected_quantity - i.received_quantity,
        received_quantity: 0,
      }));

    if (shortItems.length > 0) {
      const orderTitle = order.title ?? '입고';
      const { data: newOrder, error: newErr } = await supabase
        .from('receiving_orders')
        .insert({
          title: `[잔여] ${orderTitle}`,
          status: 'pending',
          memo: `부분입고 완료 — 잔여분 (원본: ${orderTitle}, 미입고 ${totalExpected - totalReceived}개)`,
          workspace_id: workspaceId,
        })
        .select('id')
        .single();

      if (!newErr && newOrder) {
        carryOverId = newOrder.id;
        await supabase
          .from('receiving_items')
          .insert(
            shortItems.map((si) => ({
              receiving_order_id: newOrder.id,
              ...si,
              workspace_id: workspaceId,
            })),
          );
      }
    }

    // 원본 항목의 expected_quantity를 received_quantity로 맞춤
    for (const item of items) {
      if (item.received_quantity < item.expected_quantity) {
        await supabase
          .from('receiving_items')
          .update({ expected_quantity: item.received_quantity })
          .eq('id', item.id);
      }
    }
  }

  // 지시서 완료
  const { error } = await supabase
    .from('receiving_orders')
    .update({
      status: 'completed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) return { error: error.message };

  revalidatePath('/receiving');
  return {
    success: true,
    partial: !allFulfilled,
    totalExpected,
    totalReceived,
    carryOverId,
  };
}

// ── 입고지시서 상세 조회 (확정 페이지용) ──

export async function getReceivingOrderDetail(id: string) {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('receiving_orders')
    .select(`
      id, title, status, memo, created_at, completed_at,
      receiving_items(
        id, product_id, expected_quantity, received_quantity,
        products(id, name, barcode)
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── 스테이징 목록 조회 (미매칭) ──

export async function getStagingItems() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('receiving_staging')
    .select(`
      id, product_id, quantity, scanned_barcode, memo, created_at,
      products(name, barcode, is_temporary)
    `)
    .is('matched_receiving_item_id', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return data;
}

// ── 스테이징 → 입고지시서 항목에 매칭 (시리얼 연결 제거 — 확정 전이므로) ──

export async function matchStagingToReceivingItem(
  stagingId: string,
  receivingItemId: string,
) {
  const supabase = await createAdminClient();

  const { data: staging } = await supabase
    .from('receiving_staging')
    .select('id, product_id, quantity, matched_receiving_item_id')
    .eq('id', stagingId)
    .single();

  if (!staging) return { error: '스테이징 항목을 찾을 수 없습니다' };
  if (staging.matched_receiving_item_id) return { error: '이미 매칭된 항목입니다' };

  const { data: item } = await supabase
    .from('receiving_items')
    .select('id, product_id, expected_quantity, received_quantity, receiving_order_id')
    .eq('id', receivingItemId)
    .single();

  if (!item) return { error: '입고지시서 항목을 찾을 수 없습니다' };
  if (item.product_id !== staging.product_id) return { error: '제품이 일치하지 않습니다' };

  // 매칭 처리
  await supabase
    .from('receiving_staging')
    .update({
      matched_receiving_item_id: receivingItemId,
      matched_at: new Date().toISOString(),
    })
    .eq('id', stagingId);

  // received_quantity 증가
  await supabase
    .from('receiving_items')
    .update({ received_quantity: item.received_quantity + staging.quantity })
    .eq('id', receivingItemId);

  // 지시서 상태를 in_progress로
  await supabase
    .from('receiving_orders')
    .update({ status: 'in_progress' })
    .eq('id', item.receiving_order_id)
    .eq('status', 'pending');

  revalidatePath('/receiving');
  return { success: true };
}

// ── 스테이징 자동매칭 ──

export async function autoMatchStaging() {
  const supabase = await createAdminClient();

  const { data: unmatched } = await supabase
    .from('receiving_staging')
    .select('id, product_id, quantity')
    .is('matched_receiving_item_id', null)
    .order('created_at', { ascending: true });

  if (!unmatched || unmatched.length === 0) return { error: '매칭할 스테이징이 없습니다' };

  let matchedCount = 0;

  for (const staging of unmatched) {
    const { data: candidates } = await supabase
      .from('receiving_items')
      .select(`
        id, expected_quantity, received_quantity, receiving_order_id,
        receiving_orders!inner(status)
      `)
      .eq('product_id', staging.product_id)
      .in('receiving_orders.status', ['pending', 'in_progress'])
      .order('created_at', { ascending: true });

    const target = (candidates ?? []).find(
      (c) => c.received_quantity < c.expected_quantity,
    );

    if (target) {
      await supabase
        .from('receiving_staging')
        .update({
          matched_receiving_item_id: target.id,
          matched_at: new Date().toISOString(),
        })
        .eq('id', staging.id);

      await supabase
        .from('receiving_items')
        .update({ received_quantity: target.received_quantity + staging.quantity })
        .eq('id', target.id);

      await supabase
        .from('receiving_orders')
        .update({ status: 'in_progress' })
        .eq('id', target.receiving_order_id)
        .eq('status', 'pending');

      matchedCount++;
    }
  }

  revalidatePath('/receiving');
  return { success: true, matchedCount, total: unmatched.length };
}

// ── 수동 입고 처리 (체크한 품목의 received_quantity 증가) ──

export async function receiveItems(
  orderId: string,
  items: { receivingItemId: string; quantity: number }[],
) {
  const supabase = await createAdminClient();

  const { data: order } = await supabase
    .from('receiving_orders')
    .select('id, status')
    .eq('id', orderId)
    .single();

  if (!order) return { error: '입고지시서를 찾을 수 없습니다' };
  if (order.status === 'completed' || order.status === 'cancelled') {
    return { error: '완료 또는 취소된 지시서는 수정할 수 없습니다' };
  }

  for (const item of items) {
    const { data: ri } = await supabase
      .from('receiving_items')
      .select('id, received_quantity')
      .eq('id', item.receivingItemId)
      .eq('receiving_order_id', orderId)
      .single();

    if (!ri) return { error: `항목을 찾을 수 없습니다: ${item.receivingItemId}` };

    await supabase
      .from('receiving_items')
      .update({ received_quantity: ri.received_quantity + item.quantity })
      .eq('id', item.receivingItemId);
  }

  // 상태를 in_progress로 변경 (pending인 경우)
  if (order.status === 'pending') {
    await supabase
      .from('receiving_orders')
      .update({ status: 'in_progress' })
      .eq('id', orderId);
  }

  // 전체 입고 완료 여부 확인 → awaiting_confirmation
  const { data: allItems } = await supabase
    .from('receiving_items')
    .select('expected_quantity, received_quantity')
    .eq('receiving_order_id', orderId);

  if (allItems) {
    const allDone = allItems.every((i) => i.received_quantity >= i.expected_quantity);
    if (allDone) {
      await supabase
        .from('receiving_orders')
        .update({ status: 'awaiting_confirmation' })
        .eq('id', orderId);
    }
  }

  revalidatePath('/receiving');
  revalidatePath(`/receiving-orders/${orderId}`);
  return { success: true };
}

// ── 제품 목록 (입고지시서 생성 시 제품 선택용) ──

export async function getProductsForReceiving() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('products')
    .select('id, name, barcode, base_stock')
    .order('name');

  if (error) throw new Error(error.message);
  return data;
}
