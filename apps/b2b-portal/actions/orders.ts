'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendAlert } from '@/lib/email/send';

export async function getOrders(companyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, created_at, confirmed_at,
      order_items(quantity, unit_price, products(name)),
      quotations!order_id(id, number, status, quotation_items(product_id, label, quantity, unit_price, is_taxable))
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// 발주 신청 — 재고 즉시 차감 (DB 원자적 RPC)
export async function createOrder(
  companyId: string,
  items: { product_id: string; quantity: number; unit_price: number }[],
  notes?: string,
) {
  const serviceClient = createServiceClient();

  const { data, error } = await serviceClient.rpc('create_order_with_stock_deduction', {
    p_company_id: companyId,
    p_items: items,
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
    const { data: company } = await serviceClient
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single();

    const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const appUrl = process.env.NEXT_PUBLIC_ADMIN_URL || '';

    sendAlert({
      to: adminEmail,
      title: '신규 발주가 접수되었습니다',
      message: `${company?.name ?? '업체'}에서 새로운 발주를 신청했습니다.\n\n• 품목 수: ${items.length}건\n• 합계 금액: ₩${totalAmount.toLocaleString()}\n\n어드민에서 확인해 주세요.`,
      alertType: 'info',
      ctaLabel: '발주 확인하기',
      ctaUrl: `${appUrl}/orders/${orderId}`,
    }).catch(() => {/* 이메일 실패 무시 */});
  }

  revalidatePath('/orders');
  return { success: true, orderId };
}

// B2B가 미확정 발주 취소 → 재고 복원 + status = 'cancelled'
export async function cancelOrder(orderId: string) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  // 발주 확인
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, company_id')
    .eq('id', orderId)
    .single();

  if (!order) return { error: '발주를 찾을 수 없습니다' };
  if (order.status !== 'pending') return { error: '확정 전 발주만 취소할 수 있습니다' };

  // 발주 항목 조회 (재고 복원용)
  const { data: items } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId);

  // 재고 복원 (발주 생성 시 차감된 수량)
  if (items && items.length > 0) {
    for (const item of items) {
      const { data: product } = await serviceClient
        .from('products')
        .select('base_stock')
        .eq('id', item.product_id)
        .single();

      if (product) {
        await serviceClient
          .from('products')
          .update({ base_stock: product.base_stock + item.quantity })
          .eq('id', item.product_id);
      }
    }
  }

  // 상태 변경
  const { error } = await serviceClient
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId);

  if (error) return { error: error.message };

  revalidatePath('/orders');
  return { success: true };
}

// B2B가 견적서 확정 → order.status = 'confirmed', 최신 견적서 발행인을 수주 담당자로 기록
export async function confirmOrder(orderId: string) {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .single();

  if (!order) return { error: '발주를 찾을 수 없습니다' };
  if (order.status !== 'pending') return { error: '이미 처리된 발주입니다' };

  // 최신 견적서의 발행인을 수주 담당자로
  const { data: latestQuotation } = await supabase
    .from('quotations')
    .select('issued_by')
    .eq('order_id', orderId)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from('orders')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: latestQuotation?.issued_by ?? null,
    })
    .eq('id', orderId);

  if (error) return { error: error.message };

  revalidatePath('/orders');
  return { success: true };
}
