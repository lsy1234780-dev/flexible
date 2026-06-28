'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { sendAlert } from '@/lib/email';
import { generateQuotationBuffer } from '@/lib/pdf';
import type { QuotationData } from '@/lib/pdf';
import { getIssuerInfo } from '@/lib/issuerInfo';

const B2B_PORTAL_URL = process.env.NEXT_PUBLIC_B2B_PORTAL_URL ?? 'http://localhost:3002';
const BRAND_NAME = process.env.EMAIL_BRAND_NAME ?? 'B2B 협력사 포털';

export async function getQuotations() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('quotations')
    .select('*, companies(id, name)')
    .order('issued_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getQuotation(id: string) {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('quotations')
    .select('*, companies(id, name), quotation_items(*, products(name, barcode)), orders!order_id(id, order_number, status)')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createQuotation(
  companyId: string,
  items: { product_id?: string | null; label?: string | null; quantity: number; unit_price: number; is_taxable?: boolean }[],
) {
  const supabase = await createClient();

  // 현재 로그인 사용자 이메일
  const { data: { user } } = await supabase.auth.getUser();
  const issuedBy = user?.email ?? null;

  // 견적번호 채번 (Q-YYYY-NNN)
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('quotations')
    .select('*', { count: 'exact', head: true })
    .like('number', `Q-${year}-%`);
  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const number = `Q-${year}-${seq}`;

  const workspaceId = await getCurrentWorkspaceId();

  const { data: quotation, error: qErr } = await supabase
    .from('quotations')
    .insert({ company_id: companyId, number, status: 'draft', issued_by: issuedBy, workspace_id: workspaceId })
    .select()
    .single();
  if (qErr) return { error: qErr.message };

  const { error: iErr } = await supabase.from('quotation_items').insert(
    items.map((item) => ({
      quotation_id: quotation.id,
      product_id: item.product_id ?? null,
      label: item.label ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      is_taxable: item.is_taxable ?? true,
      workspace_id: workspaceId,
    })),
  );
  if (iErr) return { error: iErr.message };

  revalidatePath('/quotations');
  return { success: true, quotationId: quotation.id, number };
}

export async function updateQuotationStatus(id: string, status: 'draft' | 'sent' | 'confirmed') {
  const supabase = await createClient();
  const { error } = await supabase.from('quotations').update({ status }).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/quotations');
  return { success: true };
}

// 특정 견적서를 PDF 생성 + 이메일 발송
export async function sendQuotationEmail(quotationId: string) {
  const supabase = await createClient();

  // 견적서 + 업체 + 항목 조회
  const { data: quotation, error: qErr } = await supabase
    .from('quotations')
    .select('id, number, order_id, company_id, companies(name, auth_user_id), quotation_items(product_id, label, quantity, unit_price, is_taxable, products(name, barcode))')
    .eq('id', quotationId)
    .single();
  if (qErr || !quotation) return { error: '견적서를 찾을 수 없습니다' };

  // 연결된 발주가 취소됐는지 확인
  if (quotation.order_id) {
    const { data: order } = await supabase
      .from('orders')
      .select('status, order_number')
      .eq('id', quotation.order_id)
      .single();
    if (order?.status === 'cancelled') return { error: '취소된 발주에는 견적서를 발송할 수 없습니다' };
  }

  const company = quotation.companies as unknown as { name: string; auth_user_id: string | null } | null;
  const qItems = quotation.quotation_items as unknown as Array<{
    product_id: string | null; label: string | null; quantity: number; unit_price: number; is_taxable: boolean;
    products: { name: string; barcode: string } | null;
  }>;

  // 상태를 sent로 갱신
  await supabase.from('quotations').update({ status: 'sent', issued_at: new Date().toISOString() }).eq('id', quotationId);

  // PDF 생성
  const pdfData: QuotationData = {
    quotationNumber: quotation.number,
    issuedAt: new Date(),
    issuer: getIssuerInfo(),
    company: { name: company?.name ?? '미지정' },
    items: qItems.map((item) => ({
      productName: item.label ?? item.products?.name ?? '-',
      barcode: item.products?.barcode ?? '',
      quantity: item.quantity,
      unitPrice: item.unit_price,
      totalPrice: item.quantity * item.unit_price,
      isTaxable: item.is_taxable,
      isCustom: !item.product_id,
    })),
    taxRate: 0.1,
  };
  const pdfBuffer = await generateQuotationBuffer(pdfData);

  // 이메일 발송 (PDF 첨부)
  if (company?.auth_user_id) {
    const { data: email } = await supabase.rpc('get_user_email', { p_user: company.auth_user_id });
    if (email) {
      await sendAlert({
        to: email,
        brandName: BRAND_NAME,
        title: `견적서 ${quotation.number} 도착`,
        message: `${company.name} 담당자님,\n\n견적서(${quotation.number})를 첨부드립니다.\n내용 확인 후 발주를 확정해 주세요.`,
        alertType: 'info',
        ctaLabel: '발주 현황 확인하기',
        ctaUrl: `${B2B_PORTAL_URL}/orders`,
        attachments: [{
          filename: `견적서_${quotation.number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      });
    }
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath('/quotations');
  if (quotation.order_id) {
    revalidatePath(`/orders`);
  }
  return { success: true, number: quotation.number };
}


export async function updateQuotationItems(
  quotationId: string,
  items: { id?: string; product_id: string | null; label: string | null; quantity: number; unit_price: number; is_taxable: boolean }[],
) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  // 견적서 조회 — 연결된 발주가 있는지 확인
  const { data: quotation } = await supabase
    .from('quotations')
    .select('order_id')
    .eq('id', quotationId)
    .single();

  // 기존 항목 삭제 후 재삽입
  const { error: delErr } = await supabase
    .from('quotation_items')
    .delete()
    .eq('quotation_id', quotationId);
  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase.from('quotation_items').insert(
    items.map((item) => ({
      quotation_id: quotationId,
      product_id: item.product_id,
      label: item.label,
      quantity: item.quantity,
      unit_price: item.unit_price,
      is_taxable: item.is_taxable,
      workspace_id: workspaceId,
    })),
  );
  if (insErr) return { error: insErr.message };

  // 연결된 발주가 있고 아직 pending이면 발주 항목도 동기화 (제품 항목만)
  if (quotation?.order_id) {
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .eq('id', quotation.order_id)
      .single();

    if (order && order.status === 'pending') {
      const productItems = items.filter((i) => i.product_id);
      const { error: oDelErr } = await supabase.from('order_items').delete().eq('order_id', order.id);
      if (oDelErr) return { error: `발주 동기화 실패: ${oDelErr.message}` };

      if (productItems.length > 0) {
        const { error: oInsErr } = await supabase.from('order_items').insert(
          productItems.map((item) => ({
            order_id: order.id,
            product_id: item.product_id!,
            quantity: item.quantity,
            unit_price: item.unit_price,
            workspace_id: workspaceId,
          })),
        );
        if (oInsErr) return { error: `발주 동기화 실패: ${oInsErr.message}` };
      }

      revalidatePath(`/orders/${order.order_number ?? order.id}`);
    }
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath('/quotations');
  revalidatePath('/orders');
  return { success: true };
}

// 발주 기반 견적서 생성 (이메일 발송 없이 draft로 생성)
export async function createQuotationFromOrder(orderId: string) {
  const supabase = await createClient();

  // 현재 로그인 사용자 이메일
  const { data: { user } } = await supabase.auth.getUser();
  const issuedBy = user?.email ?? null;

  // 발주 조회
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('id, order_number, status, company_id, order_items(product_id, quantity, unit_price)')
    .eq('id', orderId)
    .single();
  if (oErr || !order) return { error: '발주를 찾을 수 없습니다' };
  if (order.status === 'cancelled') return { error: '취소된 발주에는 견적서를 작성할 수 없습니다' };

  const orderItems = order.order_items as unknown as Array<{
    product_id: string; quantity: number; unit_price: number;
  }>;

  // 항상 새 견적서 생성 (1:N)
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('quotations')
    .select('*', { count: 'exact', head: true })
    .like('number', `Q-${year}-%`);
  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const number = `Q-${year}-${seq}`;

  const workspaceId = await getCurrentWorkspaceId();

  const { data: quotation, error: cErr } = await supabase
    .from('quotations')
    .insert({ company_id: order.company_id, number, status: 'draft', order_id: orderId, issued_by: issuedBy, workspace_id: workspaceId })
    .select('id, number')
    .single();
  if (cErr) return { error: cErr.message };

  // 발주 항목을 견적서 항목으로 복사
  const { error: iErr } = await supabase.from('quotation_items').insert(
    orderItems.map((item) => ({
      quotation_id: quotation.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      is_taxable: true,
      workspace_id: workspaceId,
    })),
  );
  if (iErr) return { error: iErr.message };

  revalidatePath(`/orders/${order.order_number ?? orderId}`);
  revalidatePath('/quotations');
  return { success: true, quotationId: quotation.id, number: quotation.number };
}

export async function deleteQuotation(id: string) {
  const supabase = await createClient();
  // 항목 먼저 삭제 (FK 제약)
  const { error: itemErr } = await supabase.from('quotation_items').delete().eq('quotation_id', id);
  if (itemErr) return { error: itemErr.message };

  const { error } = await supabase.from('quotations').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/quotations');
  return { success: true };
}
