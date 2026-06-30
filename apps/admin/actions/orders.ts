'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { sendAlert } from '@/lib/email';
import type { OrderStatus } from '@/types/database';

const B2B_PORTAL_URL = process.env.NEXT_PUBLIC_B2B_PORTAL_URL ?? 'http://localhost:3002';
const BRAND_NAME = process.env.EMAIL_BRAND_NAME ?? 'B2B 협력사 포털';

// ── 조회 ──

export async function getAdminOrders() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, confirmed_at, confirmed_by, created_at,
      companies(id, name),
      order_items(quantity, unit_price, products(name))
    `)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

const PREVIEW_ORDERS: Record<string, object> = {
  'preview-001': { id: 'preview-001', order_number: 'ORD-2025-001', status: 'completed', notes: null, created_at: '2025-10-04T09:00:00', confirmed_at: '2025-10-04T10:00:00', confirmed_by: 'admin@example.com', companies: { id: 'c1', name: 'AA유통', contact_name: '김OO', contact_phone: '010-1234-5678', contact_email: 'jw@jungwook.com', contact_position: '대표' }, order_items: [{ id: 'oi-001', product_id: 'p1', quantity: 8, unit_price: 92000, products: { name: '무선 바코드 스캐너 BT-100', barcode: '8801234000001' } }], quotations: [], shipments: [{ id: 'sh-001', notified_at: '2025-10-04T14:00:00', serial_level: 'L0', serial_source: null }] },
  'preview-002': { id: 'preview-002', order_number: 'ORD-2025-002', status: 'completed', notes: null, created_at: '2025-10-11T09:00:00', confirmed_at: '2025-10-11T10:00:00', confirmed_by: 'admin@example.com', companies: { id: 'c2', name: 'BB전자', contact_name: '이OO', contact_phone: '010-2345-6789', contact_email: null, contact_position: '구매팀장' }, order_items: [{ id: 'oi-002', product_id: 'p2', quantity: 5, unit_price: 102000, products: { name: '2D QR 스캐너 Q-200', barcode: '8801234000002' } }, { id: 'oi-003', product_id: 'p1', quantity: 3, unit_price: 88000, products: { name: '무선 바코드 스캐너 BT-100', barcode: '8801234000001' } }], quotations: [], shipments: [{ id: 'sh-002', notified_at: '2025-10-11T15:00:00', serial_level: 'L0', serial_source: null }] },
  'preview-003': { id: 'preview-003', order_number: 'ORD-2025-003', status: 'completed', notes: null, created_at: '2025-10-22T09:00:00', confirmed_at: '2025-10-22T10:00:00', confirmed_by: 'admin@example.com', companies: { id: 'c3', name: 'CC물류', contact_name: '박OO', contact_phone: '010-3456-7890', contact_email: null, contact_position: '물류팀장' }, order_items: [{ id: 'oi-004', product_id: 'p4', quantity: 3, unit_price: 220000, products: { name: '라벨 프린터 LP-400', barcode: '8801234000004' } }], quotations: [], shipments: [{ id: 'sh-003', notified_at: '2025-10-22T14:00:00', serial_level: 'L1', serial_source: null }] },
};

// preview-xxx 중 정의되지 않은 ID는 generic mock 반환
function makePreviewOrder(id: string) {
  return PREVIEW_ORDERS[id] ?? {
    id, order_number: `ORD-PREVIEW`, status: 'completed', notes: null,
    created_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), confirmed_by: 'admin@example.com',
    companies: { id: 'c1', name: '(미리보기 거래처)', contact_name: null, contact_phone: null, contact_email: null, contact_position: null },
    order_items: [{ id: 'oi-preview', product_id: 'p1', quantity: 1, unit_price: 0, products: { name: '(미리보기 제품)', barcode: '' } }],
    quotations: [], shipments: [{ id: 'sh-preview', notified_at: null, serial_level: 'L0', serial_source: null }],
  };
}

export async function getAdminOrder(slug: string) {
  if (process.env.PREVIEW_MODE === 'true') return makePreviewOrder(slug);
  const supabase = await createClient();
  const query = supabase
    .from('orders')
    .select(`
      id, order_number, status, notes, confirmed_at, confirmed_by, created_at,
      companies(id, name, contact_name, contact_phone, contact_email, contact_position),
      order_items(id, product_id, quantity, unit_price, products(name, barcode)),
      quotations!order_id(id, number, status, issued_at, quotation_items(product_id, label, quantity, unit_price, is_taxable)),
      shipments!order_id(id, notified_at, serial_level, serial_source)
    `);

  // order_number로 먼저 시도, 없으면 uuid로 조회
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  const { data, error } = await (isUuid
    ? query.eq('id', slug)
    : query.eq('order_number', slug)
  ).single();

  if (error) throw new Error(error.message);
  return data;
}

// ── CRM 로그 헬퍼 ──

async function logCrm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  orderId: string,
  action: string,
  memo?: string,
) {
  await supabase.from('crm_logs').insert({
    company_id: companyId,
    order_id: orderId,
    action,
    memo: memo ?? null,
    entity_type: 'company',
    entity_id: companyId,
    kind: 'system',
    workspace_id: await getCurrentWorkspaceId(),
  });
}

// ── 상태 전이 ──

/** pending → confirmed: 재고 원자적 차감 */
export async function confirmOrder(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };
  const confirmedBy = user.email ?? null;

  // 주문 정보 조회 (company_id + 업체 정보)
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status, company_id, companies(name, auth_user_id)')
    .eq('id', id)
    .single();
  if (!order) return { error: '주문을 찾을 수 없습니다' };
  if (order.status !== 'pending') return { error: '대기 상태의 주문만 확정할 수 있습니다' };
  const orderSlug = order.order_number ?? id;

  // RPC로 원자적 재고 차감 + 상태 변경
  const { error } = await supabase.rpc('confirm_order_with_stock_deduction', {
    p_order_id: id,
  });

  if (error) {
    if (error.message.includes('STOCK_ERROR:')) {
      const msg = error.message.split('STOCK_ERROR:')[1];
      return { error: `재고 부족: ${msg}` };
    }
    return { error: error.message };
  }

  // 수주 담당자 기록
  await supabase.from('orders').update({ confirmed_by: confirmedBy }).eq('id', id);

  await logCrm(supabase, order.company_id, id, '발주 확정', '재고 차감 완료');

  // 미발송 견적서가 있으면 자동 발송 처리 (draft → sent)
  const { data: quotation } = await supabase
    .from('quotations')
    .select('id, number, status')
    .eq('order_id', id)
    .maybeSingle();

  if (quotation && quotation.status === 'draft') {
    await supabase
      .from('quotations')
      .update({ status: 'sent' })
      .eq('id', quotation.id);
  }

  // B2B 업체에 발주 확정 이메일 발송 (견적서 정보 포함)
  const company = order.companies as unknown as { name: string; auth_user_id: string | null } | null;
  if (company?.auth_user_id) {
    const { data: email } = await supabase.rpc('get_user_email', { p_user: company.auth_user_id });
    if (email) {
      const quotationNote = quotation
        ? `\n\n견적서(${quotation.number})도 함께 확인하실 수 있습니다.`
        : '';
      await sendAlert({
        to: email,
        brandName: BRAND_NAME,
        title: '발주가 확정되었습니다',
        message: `${company.name} 담당자님,\n\n요청하신 발주가 확정되었습니다.\n재고가 확보되었으며, 곧 출고 처리될 예정입니다.${quotationNote}\n\n포털에서 발주 상태를 확인하실 수 있습니다.`,
        alertType: 'success',
        ctaLabel: '발주 현황 보기',
        ctaUrl: `${B2B_PORTAL_URL}/orders`,
      });
    }
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderSlug}`);
  revalidatePath('/inventory');
  revalidatePath('/quotations');
  return { success: true };
}

/** confirmed → shipped: 출고 지시 (shipment 생성) */
export async function shipOrder(
  id: string,
  options?: { serial_level?: 'L0' | 'L1' | 'L2' | 'L3' },
) {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status, company_id')
    .eq('id', id)
    .single();
  if (!order) return { error: '주문을 찾을 수 없습니다' };
  if (order.status !== 'confirmed') return { error: '확정된 주문만 출고할 수 있습니다' };
  const orderSlug = order.order_number ?? id;

  const level = options?.serial_level ?? 'L0';

  // shipment 레코드 생성
  const { error: shipError } = await supabase.from('shipments').insert({
    order_id: id,
    status: 'pending',
    serial_level: level,
    workspace_id: await getCurrentWorkspaceId(),
  });
  if (shipError) return { error: shipError.message };

  // 주문 상태 변경
  const { error } = await supabase
    .from('orders')
    .update({ status: 'shipped' })
    .eq('id', id);
  if (error) return { error: error.message };

  await logCrm(supabase, order.company_id, id, '출고 지시');

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderSlug}`);
  revalidatePath('/inventory');
  revalidatePath('/logistics-scan');
  return { success: true };
}

/** shipped → packed: 집하완료 (물류팀 바코드 스캔 완료) */
export async function packOrder(id: string) {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status, company_id')
    .eq('id', id)
    .single();
  if (!order) return { error: '주문을 찾을 수 없습니다' };
  if (order.status !== 'shipped') return { error: '출고지시 상태의 주문만 집하완료 처리할 수 있습니다' };
  const orderSlug = order.order_number ?? id;

  await supabase
    .from('shipments')
    .update({ status: 'packed', packed_at: new Date().toISOString() })
    .eq('order_id', id);

  const { error } = await supabase
    .from('orders')
    .update({ status: 'packed' })
    .eq('id', id);
  if (error) return { error: error.message };

  await logCrm(supabase, order.company_id, id, '집하 완료');

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderSlug}`);
  revalidatePath('/logistics-delivery');
  return { success: true };
}

/** packed → completed: 출하완료 (어드민/물류 일괄 처리) */
export async function completeOrder(id: string) {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status, company_id')
    .eq('id', id)
    .single();
  if (!order) return { error: '주문을 찾을 수 없습니다' };
  if (order.status !== 'packed') return { error: '집하완료 상태의 주문만 출하 처리할 수 있습니다' };
  const orderSlug = order.order_number ?? id;

  await supabase
    .from('shipments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('order_id', id);

  const { error } = await supabase
    .from('orders')
    .update({ status: 'completed' })
    .eq('id', id);
  if (error) return { error: error.message };

  await logCrm(supabase, order.company_id, id, '출하 완료');

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderSlug}`);
  revalidatePath('/logistics-delivery');
  return { success: true };
}

/** 출하완료 알림 이메일 발송 (어드민에서 수동 클릭) */
export async function sendShipmentNotification(orderId: string) {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status, company_id, companies(name, auth_user_id)')
    .eq('id', orderId)
    .single();
  if (!order) return { error: '주문을 찾을 수 없습니다' };
  if (order.status !== 'completed') return { error: '출하완료 상태의 주문만 알림을 보낼 수 있습니다' };

  const company = order.companies as unknown as { name: string; auth_user_id: string | null } | null;
  if (!company?.auth_user_id) return { error: '업체에 연결된 계정이 없습니다' };

  const { data: email } = await supabase.rpc('get_user_email', { p_user: company.auth_user_id });
  if (!email) return { error: '업체 이메일을 찾을 수 없습니다' };

  const orderLabel = order.order_number ?? order.id.slice(0, 8);
  const result = await sendAlert({
    to: email,
    brandName: BRAND_NAME,
    title: '상품이 출하되었습니다',
    message: `${company.name} 담당자님,\n\n주문(${orderLabel}) 상품이 출하 처리되었습니다.\n포털에서 배송 상태를 확인하실 수 있습니다.`,
    alertType: 'success',
    ctaLabel: '주문 현황 보기',
    ctaUrl: `${B2B_PORTAL_URL}/orders`,
  });

  if (!result.success) return { error: result.error ?? '이메일 발송 실패' };

  // 발송 시각 기록
  await supabase
    .from('shipments')
    .update({ notified_at: new Date().toISOString() })
    .eq('order_id', orderId);

  await logCrm(supabase, order.company_id, orderId, '출하 알림 발송', `이메일: ${email}`);

  revalidatePath(`/orders/${order.order_number ?? orderId}`);
  return { success: true };
}

/** 집하완료 건 일괄 출하처리 */
export async function batchCompleteOrders(ids: string[]) {
  const results: { id: string; success?: boolean; error?: string }[] = [];
  for (const id of ids) {
    const result = await completeOrder(id);
    results.push({ id, ...result });
  }
  revalidatePath('/orders');
  revalidatePath('/logistics-delivery');
  return results;
}

/** pending/confirmed → cancelled: 취소 (confirmed면 재고 복원) */
export async function cancelOrder(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status, company_id')
    .eq('id', id)
    .single();
  if (!order) return { error: '주문을 찾을 수 없습니다' };
  const orderSlug = order.order_number ?? id;

  // RPC로 취소 + 재고 복원 (confirmed면 복원, pending이면 그냥 취소)
  const { error } = await supabase.rpc('cancel_order_with_stock_restore', {
    p_order_id: id,
  });

  if (error) {
    if (error.message.includes('INVALID_STATUS:')) {
      const msg = error.message.split('INVALID_STATUS:')[1];
      return { error: msg };
    }
    return { error: error.message };
  }

  const wasConfirmed = order.status === 'confirmed';
  await logCrm(
    supabase,
    order.company_id,
    id,
    '발주 취소',
    wasConfirmed ? '재고 복원 완료' : undefined,
  );

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderSlug}`);
  revalidatePath('/inventory');
  return { success: true };
}

// ── CRM 로그 조회 ──

export async function getCompanyCrmLogs(companyId: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('crm_logs')
    .select('*, orders(id, status)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
}

// ── 물류 ──

export async function getShippedOrders() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, created_at, confirmed_at,
      companies(id, name),
      order_items(id, quantity, unit_price, products(name, barcode)),
      shipments!order_id(id, status, created_at)
    `)
    .eq('status', 'shipped')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getPackedOrders() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, created_at,
      companies(id, name),
      order_items(id, quantity, products(name)),
      shipments!order_id(id, packed_at)
    `)
    .eq('status', 'packed')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getRecentCompletedOrders(limit = 20) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, created_at,
      companies(id, name),
      order_items(id, quantity, products(name)),
      shipments!order_id(id, completed_at)
    `)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}

// ── 발주 항목 수정 (pending 상태만) — 연결 견적서도 동기화 ──

export async function updateOrderItems(
  orderId: string,
  items: { product_id: string; quantity: number; unit_price: number }[],
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  // 발주 상태 확인
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status')
    .eq('id', orderId)
    .single();
  if (!order) return { error: '발주를 찾을 수 없습니다' };
  if (order.status !== 'pending') return { error: '접수 상태의 발주만 수정할 수 있습니다' };
  const orderSlug = order.order_number ?? orderId;

  const workspaceId = await getCurrentWorkspaceId();

  // 발주 항목 삭제 후 재삽입
  const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', orderId);
  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase.from('order_items').insert(
    items.map((item) => ({
      order_id: orderId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      workspace_id: workspaceId,
    })),
  );
  if (insErr) return { error: insErr.message };

  // 연결된 견적서가 있으면 동기화
  const { data: quotation } = await supabase
    .from('quotations')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();

  if (quotation) {
    await supabase.from('quotation_items').delete().eq('quotation_id', quotation.id);
    await supabase.from('quotation_items').insert(
      items.map((item) => ({
        quotation_id: quotation.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        workspace_id: workspaceId,
      })),
    );
    revalidatePath(`/quotations/${quotation.id}`);
  }

  revalidatePath(`/orders/${orderSlug}`);
  revalidatePath('/orders');
  revalidatePath('/quotations');
  return { success: true };
}

// ── 물류 통합 이력 (수동 입출고 + 집하 + 출하) ──

export async function getLogisticsHistory(limit = 50) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  // 1. 수동 입출고 이력
  const { data: inventoryLogs } = await supabase
    .from('inventory_logs')
    .select('id, quantity, type, memo, created_at, products(name, barcode)')
    .order('created_at', { ascending: false })
    .limit(limit);

  // 2. 출고 관련 CRM 이력 (집하완료, 출하완료)
  const { data: crmLogs } = await supabase
    .from('crm_logs')
    .select('id, action, memo, created_at, orders(id, order_number, status), companies(id, name)')
    .in('action', ['집하완료', '출하완료'])
    .order('created_at', { ascending: false })
    .limit(limit);

  // 통합 후 시간순 정렬
  type HistoryItem =
    | { kind: 'inventory'; id: string; created_at: string; type: 'in' | 'out'; quantity: number; memo: string | null; productName: string; barcode: string }
    | { kind: 'logistics'; id: string; created_at: string; action: string; companyName: string; orderNumber: string | null; memo: string | null };

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

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return items.slice(0, limit);
}

export async function addCrmMemo(companyId: string, memo: string, orderId?: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('crm_logs').insert({
    company_id: companyId,
    order_id: orderId ?? null,
    action: '메모',
    memo,
    entity_type: 'company',
    entity_id: companyId,
    kind: 'note',
    workspace_id: await getCurrentWorkspaceId(),
  });
  if (error) return { error: error.message };
  revalidatePath(`/companies/${companyId}`);
  return { success: true };
}
