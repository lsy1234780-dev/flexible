'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ── 타입 ──

interface ReceivingItemRow {
  id: string;
  product_id: string;
  expected_quantity: number;
  received_quantity: number;
  products: { name: string; barcode: string } | null;
}

interface ReceivingOrderRow {
  id: string;
  title: string | null;
  status: string;
  memo: string | null;
  created_at: string;
  completed_at: string | null;
  receiving_items: ReceivingItemRow[];
}

// ── 조회: 입고지시서 목록 (물류 화면용) ──

export async function getReceivingOrders() {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('receiving_orders')
    .select(`
      id, title, status, memo, created_at, completed_at,
      receiving_items(
        id, product_id, expected_quantity, received_quantity,
        products(name, barcode)
      )
    `)
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data as unknown as ReceivingOrderRow[];
}

// ── 조회: 전체 미입고 물품 (지시서 통합 뷰) ──

export async function getPendingReceivingItems() {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('receiving_items')
    .select(`
      id, product_id, expected_quantity, received_quantity,
      products(name, barcode),
      receiving_orders!inner(id, title, status)
    `)
    .in('receiving_orders.status', ['pending', 'in_progress']);

  if (error) throw new Error(error.message);

  // 미매칭 스테이징도 조회
  const { data: stagingData } = await supabase
    .from('receiving_staging')
    .select('product_id, quantity, products(name, barcode)')
    .is('matched_receiving_item_id', null);

  // 제품별로 합산
  type AggregatedItem = {
    product_id: string;
    productName: string;
    barcode: string;
    totalExpected: number;
    totalReceived: number;
    staged: number;
    remaining: number;
  };

  const map = new Map<string, AggregatedItem>();

  for (const item of data ?? []) {
    const product = item.products as unknown as { name: string; barcode: string } | null;
    const existing = map.get(item.product_id);
    if (existing) {
      existing.totalExpected += item.expected_quantity;
      existing.totalReceived += item.received_quantity;
      existing.remaining = existing.totalExpected - existing.totalReceived;
    } else {
      map.set(item.product_id, {
        product_id: item.product_id,
        productName: product?.name ?? '-',
        barcode: product?.barcode ?? '',
        totalExpected: item.expected_quantity,
        totalReceived: item.received_quantity,
        staged: 0,
        remaining: item.expected_quantity - item.received_quantity,
      });
    }
  }

  for (const s of stagingData ?? []) {
    const product = s.products as unknown as { name: string; barcode: string } | null;
    const existing = map.get(s.product_id);
    if (existing) {
      existing.staged += s.quantity;
    } else {
      map.set(s.product_id, {
        product_id: s.product_id,
        productName: product?.name ?? '-',
        barcode: product?.barcode ?? '',
        totalExpected: 0,
        totalReceived: 0,
        staged: s.quantity,
        remaining: 0,
      });
    }
  }

  return Array.from(map.values()).filter((i) => i.remaining > 0 || i.staged > 0);
}

// ── 조회: 완료/확인대기 입고 이력 ──

export async function getReceivingHistory() {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('receiving_orders')
    .select(`
      id, title, status, created_at, completed_at,
      receiving_items(
        id, expected_quantity, received_quantity,
        products(name, barcode)
      )
    `)
    .in('status', ['awaiting_confirmation', 'completed', 'cancelled'])
    .order('completed_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return data;
}

// ── 입고 처리: 지시서 항목에 바코드 스캔 (수량 카운트만) ──

interface ReceiveResult {
  success?: boolean;
  error?: string;
  message?: string;
}

export async function receiveItemByBarcode(
  receivingOrderId: string,
  barcode: string,
  quantity: number,
): Promise<ReceiveResult> {
  const supabase = await createAdminClient();

  if (!barcode.trim()) return { error: '바코드를 입력하세요' };
  if (quantity < 1) return { error: '수량은 1 이상이어야 합니다' };

  // 바코드 → 제품 조회
  const { data: product } = await supabase
    .from('products')
    .select('id, name')
    .eq('barcode', barcode.trim())
    .single();

  if (!product) {
    return { error: `바코드 [${barcode}]에 해당하는 제품을 찾을 수 없습니다` };
  }

  // 해당 지시서에 이 제품이 있는지
  const { data: item } = await supabase
    .from('receiving_items')
    .select('id, expected_quantity, received_quantity')
    .eq('receiving_order_id', receivingOrderId)
    .eq('product_id', product.id)
    .single();

  if (!item) {
    return { error: `이 입고지시서에 [${product.name}] 항목이 없습니다` };
  }

  // received_quantity 증가 (초과입고 허용)
  const newReceived = item.received_quantity + quantity;
  await supabase
    .from('receiving_items')
    .update({ received_quantity: newReceived })
    .eq('id', item.id);

  // 지시서 상태를 in_progress로 변경 (아직 pending이면)
  await supabase
    .from('receiving_orders')
    .update({ status: 'in_progress' })
    .eq('id', receivingOrderId)
    .eq('status', 'pending');

  revalidatePath('/receiving');

  const overLabel = newReceived > item.expected_quantity
    ? ` ⚠️ 초과 +${newReceived - item.expected_quantity}`
    : '';

  return {
    success: true,
    message: `${product.name} ${quantity}개 스캔 (${newReceived}/${item.expected_quantity})${overLabel}`,
  };
}

// ── 입고완료 → 확인 대기 (어드민에서 시리얼/LOT 확정 필요) ──

export async function completeReceiving(receivingOrderId: string) {
  const supabase = await createAdminClient();

  const { data: order } = await supabase
    .from('receiving_orders')
    .select('id, title')
    .eq('id', receivingOrderId)
    .single();

  if (!order) return { error: '입고지시서를 찾을 수 없습니다' };

  const { data: items } = await supabase
    .from('receiving_items')
    .select('id, expected_quantity, received_quantity')
    .eq('receiving_order_id', receivingOrderId);

  if (!items || items.length === 0) {
    return { error: '입고 항목이 없습니다' };
  }

  const totalExpected = items.reduce((s, i) => s + i.expected_quantity, 0);
  const totalReceived = items.reduce((s, i) => s + i.received_quantity, 0);

  if (totalReceived === 0) {
    return { error: '스캔된 항목이 없습니다' };
  }

  // 확인 대기 상태로 전환 (어드민에서 시리얼/LOT 확정)
  const { error } = await supabase
    .from('receiving_orders')
    .update({ status: 'awaiting_confirmation', completed_at: new Date().toISOString() })
    .eq('id', receivingOrderId);

  if (error) return { error: error.message };

  revalidatePath('/receiving');
  revalidatePath('/history');
  return {
    success: true,
    totalExpected,
    totalReceived,
  };
}

// ── 스테이징 입고: 전체 미입고 탭에서 바코드 스캔 (지시서 무관, 수량만) ──

interface StagingResult {
  success?: boolean;
  error?: string;
  message?: string;
  needTempProduct?: boolean;
  scannedBarcode?: string;
  autoMatched?: boolean;
}

export async function receiveToStaging(
  barcode: string,
  quantity: number,
): Promise<StagingResult> {
  const supabase = await createAdminClient();

  if (!barcode.trim()) return { error: '바코드를 입력하세요' };
  if (quantity < 1) return { error: '수량은 1 이상이어야 합니다' };

  // 바코드 → 제품 조회
  const { data: product } = await supabase
    .from('products')
    .select('id, name, barcode')
    .eq('barcode', barcode.trim())
    .single();

  if (!product) {
    return {
      error: `바코드 [${barcode}]에 해당하는 제품이 없습니다.\n임시 상품을 추가하시겠습니까?`,
      needTempProduct: true,
      scannedBarcode: barcode.trim(),
    };
  }

  // 자동매칭 시도: 해당 제품이 딱 1개의 미완료 입고지시서 항목에만 있으면 자동매칭
  const { data: candidates } = await supabase
    .from('receiving_items')
    .select(`
      id, expected_quantity, received_quantity, receiving_order_id,
      receiving_orders!inner(id, title, status)
    `)
    .eq('product_id', product.id)
    .in('receiving_orders.status', ['pending', 'in_progress']);

  const unfulfilled = (candidates ?? []).filter(
    (c) => c.received_quantity < c.expected_quantity,
  );

  if (unfulfilled.length === 1) {
    // 후보가 딱 1개 → 자동매칭 (received_quantity만 증가)
    const item = unfulfilled[0];
    const order = item.receiving_orders as unknown as { id: string; title: string; status: string };

    const newReceived = item.received_quantity + quantity;
    await supabase
      .from('receiving_items')
      .update({ received_quantity: newReceived })
      .eq('id', item.id);

    // 지시서 상태를 in_progress로
    await supabase
      .from('receiving_orders')
      .update({ status: 'in_progress' })
      .eq('id', item.receiving_order_id)
      .eq('status', 'pending');

    revalidatePath('/receiving');

    const overLabel = newReceived > item.expected_quantity
      ? ` ⚠️ 초과 +${newReceived - item.expected_quantity}`
      : '';

    return {
      success: true,
      autoMatched: true,
      message: `${product.name} ${quantity}개 자동매칭 → ${order.title ?? '지시서'} (${newReceived}/${item.expected_quantity})${overLabel}`,
    };
  }

  // 후보가 0개 또는 2개 이상 → 스테이징으로
  return await processStagingReceive(supabase, product, barcode.trim(), quantity);
}

// 임시상품 생성 후 스테이징 입고
export async function createTempProductAndReceive(
  barcode: string,
  quantity: number,
): Promise<StagingResult> {
  const supabase = await createAdminClient();

  if (!barcode.trim()) return { error: '바코드를 입력하세요' };

  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('barcode', barcode.trim())
    .single();

  if (existing) {
    return { error: '이미 등록된 바코드입니다. 다시 스캔하세요.' };
  }

  const { data: newProduct, error: createErr } = await supabase
    .from('products')
    .insert({
      name: `임시상품 (${barcode.trim()})`,
      barcode: barcode.trim(),
      base_price: 0,
      base_stock: 0,
      is_temporary: true,
    })
    .select('id, name, barcode')
    .single();

  if (createErr) return { error: `임시상품 생성 실패: ${createErr.message}` };

  return await processStagingReceive(supabase, newProduct, barcode.trim(), quantity);
}

// 스테이징 입고 공통 로직 (수량 카운트만 — 시리얼/재고는 어드민 확정 시)
async function processStagingReceive(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  product: { id: string; name: string; barcode: string },
  barcode: string,
  quantity: number,
): Promise<StagingResult> {
  const { error: stagingErr } = await supabase
    .from('receiving_staging')
    .insert({
      product_id: product.id,
      quantity,
      scanned_barcode: barcode,
    });

  if (stagingErr) return { error: `스테이징 생성 실패: ${stagingErr.message}` };

  revalidatePath('/receiving');

  return {
    success: true,
    message: `${product.name} ${quantity}개 스테이징 등록`,
  };
}

// ── 스테이징 목록 조회 (미매칭) ──

export async function getStagingItems() {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('receiving_staging')
    .select(`
      id, product_id, quantity, scanned_barcode, memo, created_at,
      products(name, barcode, is_temporary)
    `)
    .is('matched_receiving_item_id', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return data;
}

// ── 입고지시서 취소 (확정 전: 단순 취소, 확정 후: 시리얼 삭제 + 재고 복원) ──

export async function cancelReceiving(receivingOrderId: string) {
  const supabase = await createAdminClient();

  const { data: order } = await supabase
    .from('receiving_orders')
    .select('id, status')
    .eq('id', receivingOrderId)
    .single();

  if (!order) return { error: '입고지시서를 찾을 수 없습니다' };
  if (order.status === 'completed') return { error: '확정된 지시서는 취소할 수 없습니다' };

  // 확정 전 (pending / in_progress / awaiting_confirmation)
  // → 시리얼 미생성, 재고 미반영이므로 단순 취소
  await supabase
    .from('receiving_orders')
    .update({ status: 'cancelled' })
    .eq('id', receivingOrderId);

  revalidatePath('/receiving');
  revalidatePath('/history');
  return { success: true };
}
