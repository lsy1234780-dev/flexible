'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type SupabaseClient = Awaited<ReturnType<typeof createAdminClient>>;

async function logCrm(supabase: SupabaseClient, companyId: string, orderId: string, action: string) {
  await supabase.from('crm_logs').insert({
    company_id: companyId,
    order_id: orderId,
    action,
  });
}

// ── 조회 ──

export async function getShippedOrders() {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, created_at, confirmed_at,
      companies(id, name),
      order_items(id, product_id, quantity, unit_price, products(name, barcode)),
      shipments!order_id(id, status, serial_level, serial_source, created_at)
    `)
    .eq('status', 'shipped')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

export async function getPackedOrders() {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, created_at,
      companies(id, name),
      order_items(id, quantity, products(name)),
      shipments!order_id(id, packed_at, serial_level, serial_source)
    `)
    .eq('status', 'packed')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

export async function getRecentCompletedOrders(limit = 20) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, created_at,
      companies(id, name),
      order_items(id, quantity, products(name)),
      shipments!order_id(id, completed_at, serial_level, serial_source)
    `)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}

// ── 물류 통합 이력 ──

export async function getLogisticsHistory(limit = 50) {
  const supabase = await createAdminClient();

  const { data: inventoryLogs } = await supabase
    .from('inventory_logs')
    .select('id, quantity, type, memo, created_at, products(name, barcode)')
    .order('created_at', { ascending: false })
    .limit(limit);

  const { data: crmLogs } = await supabase
    .from('crm_logs')
    .select('id, action, memo, created_at, orders(id, order_number, status), companies(id, name)')
    .in('action', ['집하완료', '출하완료'])
    .order('created_at', { ascending: false })
    .limit(limit);

  // 3. 입고 세션 이력
  const { data: receivingLogs } = await supabase
    .from('receiving_orders')
    .select('id, title, status, created_at, completed_at, receiving_items(received_quantity, products(name))')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit);

  type HistoryItem =
    | { kind: 'inventory'; id: string; created_at: string; type: 'in' | 'out'; quantity: number; memo: string | null; productName: string; barcode: string }
    | { kind: 'logistics'; id: string; created_at: string; action: string; companyName: string; orderNumber: string | null; memo: string | null }
    | { kind: 'receiving'; id: string; created_at: string; title: string | null; productCount: number; totalQty: number; productNames: string[] };

  const items: HistoryItem[] = [];

  for (const log of inventoryLogs ?? []) {
    items.push({
      kind: 'inventory',
      id: log.id,
      created_at: log.created_at,
      type: log.type as 'in' | 'out',
      quantity: log.quantity,
      memo: log.memo,
      productName: (log.products as unknown as { name: string; barcode: string } | null)?.name ?? '-',
      barcode: (log.products as unknown as { name: string; barcode: string } | null)?.barcode ?? '-',
    });
  }

  for (const log of crmLogs ?? []) {
    items.push({
      kind: 'logistics',
      id: log.id,
      created_at: log.created_at,
      action: log.action,
      companyName: (log.companies as unknown as { id: string; name: string } | null)?.name ?? '-',
      orderNumber: (log.orders as unknown as { id: string; order_number: string | null; status: string } | null)?.order_number ?? null,
      memo: log.memo,
    });
  }

  for (const log of receivingLogs ?? []) {
    const ri = log.receiving_items as unknown as { received_quantity: number; products: { name: string } | null }[];
    items.push({
      kind: 'receiving',
      id: log.id,
      created_at: log.completed_at ?? log.created_at,
      title: (log as unknown as { title: string | null }).title ?? null,
      productCount: ri.length,
      totalQty: ri.reduce((s, i) => s + i.received_quantity, 0),
      productNames: ri.map((i) => i.products?.name ?? '-').slice(0, 3),
    });
  }

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return items.slice(0, limit);
}

// ── 상태 변경 ──

/** shipped → packed: 집하완료 */
export async function packOrder(id: string) {
  const supabase = await createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, company_id')
    .eq('id', id)
    .single();
  if (!order) return { error: '주문을 찾을 수 없습니다' };
  if (order.status !== 'shipped') return { error: '출고지시 상태의 주문만 집하완료 처리할 수 있습니다' };

  await supabase
    .from('shipments')
    .update({ status: 'packed', packed_at: new Date().toISOString() })
    .eq('order_id', id);

  const { error } = await supabase
    .from('orders')
    .update({ status: 'packed' })
    .eq('id', id);
  if (error) return { error: error.message };

  await logCrm(supabase, order.company_id, id, '집하완료');

  revalidatePath('/');
  revalidatePath('/delivery');
  return { success: true };
}

/** packed → completed: 출하완료 */
export async function completeOrder(id: string) {
  const supabase = await createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status, company_id')
    .eq('id', id)
    .single();
  if (!order) return { error: '주문을 찾을 수 없습니다' };
  if (order.status !== 'packed') return { error: '집하완료 상태의 주문만 출하 처리할 수 있습니다' };

  await supabase
    .from('shipments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('order_id', id);

  const { error } = await supabase
    .from('orders')
    .update({ status: 'completed' })
    .eq('id', id);
  if (error) return { error: error.message };

  await logCrm(supabase, order.company_id, id, '출하완료');

  revalidatePath('/');
  revalidatePath('/delivery');
  return { success: true };
}

/** 일괄 출하완료 */
export async function batchCompleteOrders(ids: string[]) {
  const results: { id: string; success?: boolean; error?: string }[] = [];
  for (const id of ids) {
    const result = await completeOrder(id);
    results.push({ id, ...result });
  }
  revalidatePath('/');
  revalidatePath('/delivery');
  return results;
}
