'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendAlert } from '@/lib/email/send';
import { getSessionCompany, loadCatalog } from '@/lib/portal';

// B2B 세션은 RLS(ws_isolation)로 아무것도 읽을 수 없다.
// 모든 접근은 service client(BFF) + 세션 업체 스코프 강제 (lib/portal.ts 규칙).

export async function getOrders() {
  const company = await getSessionCompany();
  if (!company) return [];

  const service = createServiceClient();
  const { data, error } = await service
    .from('orders')
    .select(`
      id, order_number, status, created_at, confirmed_at,
      order_items(quantity, unit_price, products(name)),
      quotations!order_id(id, number, status, quotation_items(product_id, label, quantity, unit_price, is_taxable))
    `)
    .eq('company_id', company.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// 발주 신청 — 단가는 서버가 카탈로그(업체별 단가 로직)에서 결정한다.
// 클라이언트가 보낸 unit_price/companyId는 신뢰하지 않는다.
export async function createOrder(
  items: { product_id: string; quantity: number }[],
  notes?: string,
) {
  const company = await getSessionCompany();
  if (!company) return { error: '로그인이 필요합니다' };
  if (company.status !== 'active') return { error: '승인 완료 후 발주할 수 있습니다' };
  if (!items.length) return { error: '발주 항목을 추가하세요' };

  // 서버 사이드 단가 결정 + 노출/수량 검증
  const catalog = await loadCatalog(company);
  const catalogMap = new Map(catalog.map((c) => [c.id, c]));

  const resolved: { product_id: string; quantity: number; unit_price: number }[] = [];
  for (const item of items) {
    const c = catalogMap.get(item.product_id);
    if (!c) return { error: '주문할 수 없는 제품이 포함되어 있습니다' };
    const qty = Math.floor(item.quantity);
    if (!Number.isFinite(qty) || qty < 1) return { error: `${c.name}: 수량을 확인하세요` };
    if (qty > c.stock) return { error: `${c.name}: 재고 부족 (최대 ${c.stock}개)` };
    resolved.push({ product_id: c.id, quantity: qty, unit_price: c.price });
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient.rpc('create_order_with_stock_deduction', {
    p_company_id: company.id,
    p_items: resolved,
    p_notes: notes?.trim() || null,
  });

  if (error) {
    if (error.message.includes('STOCK_ERROR:')) {
      const part = error.message.split('STOCK_ERROR:')[1];
      return { error: `재고 부족: ${part}` };
    }
    if (error.message.includes('PRODUCT_NOT_FOUND:')) {
      return { error: '존재하지 않는 제품이 포함되어 있습니다' };
    }
    return { error: error.message };
  }

  const orderId = (data as { order_id: string }).order_id;

  // 관리자 이메일 알림 (fire-and-forget, 실패해도 발주는 정상 처리)
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminEmail) {
    const totalAmount = resolved.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const appUrl = process.env.NEXT_PUBLIC_ADMIN_URL || '';

    sendAlert({
      to: adminEmail,
      title: '신규 발주가 접수되었습니다',
      message: `${company.name}에서 새로운 발주를 신청했습니다.\n\n• 품목 수: ${resolved.length}건\n• 합계 금액: ₩${totalAmount.toLocaleString()}\n\n어드민에서 확인해 주세요.`,
      alertType: 'info',
      ctaLabel: '발주 확인하기',
      ctaUrl: `${appUrl}/orders/${orderId}`,
    }).catch(() => {/* 이메일 실패 무시 */});
  }

  revalidatePath('/orders');
  return { success: true, orderId };
}

// B2B가 미확정 발주 취소 — 소유권 검증 필수.
// 주의: 재고는 생성 시점이 아니라 '확정' 시점에 차감되므로(confirm RPC),
//       pending 취소는 상태 변경만 하면 된다 (복원 금지 — 복원하면 재고가 부풀려짐).
export async function cancelOrder(orderId: string) {
  const company = await getSessionCompany();
  if (!company) return { error: '로그인이 필요합니다' };

  const service = createServiceClient();
  const { data: order } = await service
    .from('orders')
    .select('id, status, company_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.company_id !== company.id) return { error: '발주를 찾을 수 없습니다' };
  if (order.status !== 'pending') return { error: '확정 전 발주만 취소할 수 있습니다' };

  const { error } = await service
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId)
    .eq('company_id', company.id);

  if (error) return { error: error.message };

  revalidatePath('/orders');
  return { success: true };
}

// B2B가 견적서 확정 — 소유권 검증 후 재고 차감 RPC로 확정 (어드민 확정과 동일 경로).
export async function confirmOrder(orderId: string) {
  const company = await getSessionCompany();
  if (!company) return { error: '로그인이 필요합니다' };

  const service = createServiceClient();
  const { data: order } = await service
    .from('orders')
    .select('id, status, company_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.company_id !== company.id) return { error: '발주를 찾을 수 없습니다' };
  if (order.status !== 'pending') return { error: '이미 처리된 발주입니다' };

  // B2B 확정 = 고객이 '관리자가 발행한 견적서'를 수락하는 계약 성립 행위.
  // admin의 내부 승인 게이트(approvals) 대신, B2B의 통제 지점은 '견적서 존재'다 —
  // 견적서는 관리자가 의도적으로 만드는 산출물이므로 이것이 재고 커밋 전 내부 통제 역할을 한다.
  // 지금까지 이 조건은 UI(hasQuotation)에서만 강제됐고 서버엔 검증이 없어, 직접 API 호출로
  // 견적 없이 확정 → 재고 차감이 가능했다. 서버에서 견적 존재를 강제해 그 우회를 막는다.
  const { data: quote } = await service
    .from('quotations')
    .select('id')
    .eq('order_id', orderId)
    .limit(1)
    .maybeSingle();
  if (!quote) return { error: '견적서가 아직 발행되지 않았습니다. 관리자 확인 후 확정할 수 있습니다.' };

  // 원자적 재고 차감 + 상태 변경 (service_role은 074 테넌트 가드를 통과)
  const { error: rpcError } = await service.rpc('confirm_order_with_stock_deduction', {
    p_order_id: orderId,
  });
  if (rpcError) {
    if (rpcError.message.includes('STOCK_ERROR:')) {
      const part = rpcError.message.split('STOCK_ERROR:')[1];
      return { error: `재고 부족: ${part}` };
    }
    if (rpcError.message.includes('INVALID_STATUS:')) {
      return { error: '이미 처리된 발주입니다' };
    }
    return { error: rpcError.message };
  }

  // 최신 견적서의 발행인을 수주 담당자로
  const { data: latestQuotation } = await service
    .from('quotations')
    .select('issued_by')
    .eq('order_id', orderId)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestQuotation?.issued_by) {
    await service
      .from('orders')
      .update({ confirmed_by: latestQuotation.issued_by })
      .eq('id', orderId);
  }

  revalidatePath('/orders');
  return { success: true };
}
