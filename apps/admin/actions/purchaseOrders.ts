'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { postRecordEvent } from '@/actions/chat';
import { getCurrentUser } from '@/actions/auth';
import { isApproved } from '@/actions/approvals';

// ── 타입 ──

export interface PurchaseOrder {
  id: string;
  po_number: string | null;
  title: string;
  supplier_id: string | null;
  supplier: string | null;
  supplier_contact: string | null;
  total_amount: number | null;
  currency: string | null;
  exchange_rate: number | null;
  vat_amount: number | null;
  payment_status: string | null;
  status: string;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  companies: { id: string; name: string; contact_name: string | null; contact_phone: string | null } | null;
  purchase_order_items: PurchaseOrderItem[];
  purchase_order_payments: PurchaseOrderPayment[];
  inbound_shipments: PurchaseOrderShipment[];
}

export interface PurchaseOrderShipment {
  id: string;
  title: string;
  stage: string;
  shipping_type: string | null;
  bl_number: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  customs_status: string | null;
  receiving_order_id: string | null;
  created_at: string;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  // 연결된 운송 건에 딸린 입고지시서 정보는 별도 fetch
}

export interface PurchaseOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number | null;
  memo: string | null;
  products: { name: string; barcode: string } | null;
}

export interface PurchaseOrderPayment {
  id: string;
  amount: number;
  currency: string | null;
  method: string | null;
  paid_at: string;
  label: string | null;
  memo: string | null;
  attachment_url: string | null;
  created_at: string;
}

export interface CreatePurchaseOrderInput {
  title: string;
  po_number?: string;
  supplier_id?: string;
  supplier?: string;
  supplier_contact?: string;
  total_amount?: number;
  currency?: string;
  exchange_rate?: number;
  vat_amount?: number;
  memo?: string;
  items?: { product_id: string; quantity: number; unit_cost?: number }[];
}

export interface UpdatePurchaseOrderInput {
  title?: string;
  po_number?: string;
  supplier_id?: string | null;
  supplier?: string;
  supplier_contact?: string;
  total_amount?: number;
  currency?: string;
  exchange_rate?: number;
  vat_amount?: number;
  payment_status?: string;
  memo?: string;
}

// ── 목록 조회 ──

export async function getPurchaseOrders() {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_PURCHASE_ORDERS } = await import('@/lib/previewData');
    return PREVIEW_PURCHASE_ORDERS as unknown as PurchaseOrder[];
  }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, title, supplier_id, supplier, supplier_contact,
      total_amount, currency, exchange_rate, vat_amount,
      payment_status, status, memo, created_by, created_at, updated_at,
      companies(id, name, contact_name, contact_phone),
      purchase_order_items(
        id, product_id, quantity, unit_cost, memo,
        products(name, barcode)
      ),
      purchase_order_payments(
        id, amount, currency, method, paid_at, label, memo, attachment_url, created_at
      ),
      inbound_shipments(id, title, stage, shipping_type, bl_number, estimated_arrival, actual_arrival, customs_status, receiving_order_id, created_at)
    `)
    .order('created_at', { ascending: false })
    .order('paid_at', { referencedTable: 'purchase_order_payments', ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PurchaseOrder[];
}

// ── 상세 조회 ──

export async function getPurchaseOrderDetail(id: string) {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, title, supplier_id, supplier, supplier_contact,
      total_amount, currency, exchange_rate, vat_amount,
      payment_status, status, memo, created_by, created_at, updated_at,
      companies(id, name, contact_name, contact_phone),
      purchase_order_items(
        id, product_id, quantity, unit_cost, memo,
        products(name, barcode)
      ),
      purchase_order_payments(
        id, amount, currency, method, paid_at, label, memo, attachment_url, created_at
      ),
      inbound_shipments(id, title, stage, shipping_type, bl_number, estimated_arrival, actual_arrival, customs_status, receiving_order_id, created_at)
    `)
    .eq('id', id)
    .order('paid_at', { referencedTable: 'purchase_order_payments', ascending: true })
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as PurchaseOrder;
}

// 발주 확정 — 승인 워크플로우 게이트. 구매발주는 수주와 달리 지금까지 확정 개념이 없었어서
// (draft/approved 상태값 자체가 이 기능을 위해 새로 추가됨) 재고 차감 같은 부수효과는 없다.
export async function finalizePurchaseOrder(id: string) {
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, title, status')
    .eq('id', id)
    .single();
  if (!po) return { error: '발주를 찾을 수 없습니다' };
  if (po.status !== 'draft') return { error: '초안 상태의 발주만 확정할 수 있습니다' };

  if (!(await isApproved('purchase_order', id))) {
    return { error: '승인이 필요합니다. 담당자에게 승인 요청을 보내세요.' };
  }

  const { error } = await supabase.from('purchase_orders').update({ status: 'approved' }).eq('id', id);
  if (error) return { error: error.message };

  await postRecordEvent('purchase_order', id, po.title, `${me.name} 님이 발주를 확정했습니다`);

  revalidatePath('/receiving');
  revalidatePath(`/receiving/${id}`);
  return { ok: true };
}

// 확정(approved)된 발주는 품목·금액·거래조건 수정 불가 — 승인받은 내용을 사후에 바꾸지 못하게 잠근다.
// (결제 기록은 확정 이후 실제로 발생하는 행위라 여기서 잠그지 않는다.)
type PoSupaClient = Awaited<ReturnType<typeof createClient>>;
async function ensurePoEditable(supabase: PoSupaClient, poId: string): Promise<string | null> {
  const { data } = await supabase.from('purchase_orders').select('status').eq('id', poId).maybeSingle();
  if (!data) return '발주를 찾을 수 없습니다';
  if (data.status === 'approved') return '확정된 발주는 수정할 수 없습니다';
  return null;
}

// ── 생성 ──

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };
  const workspaceId = await getCurrentWorkspaceId();

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .insert({
      title: input.title,
      po_number: input.po_number ?? null,
      supplier_id: input.supplier_id ?? null,
      supplier: input.supplier ?? null,
      supplier_contact: input.supplier_contact ?? null,
      total_amount: input.total_amount ?? null,
      currency: input.currency ?? 'KRW',
      exchange_rate: input.exchange_rate ?? null,
      vat_amount: input.vat_amount ?? null,
      memo: input.memo ?? null,
      workspace_id: workspaceId,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  if (input.items && input.items.length > 0) {
    const { error: itemErr } = await supabase
      .from('purchase_order_items')
      .insert(
        input.items.map((item) => ({
          purchase_order_id: po.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost ?? null,
          workspace_id: workspaceId,
        })),
      );
    if (itemErr) return { error: itemErr.message };
  }

  revalidatePath('/receiving');
  return { success: true, id: po.id };
}

// ── 수정 ──

export async function updatePurchaseOrder(id: string, input: UpdatePurchaseOrderInput | Record<string, unknown>) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const lockErr = await ensurePoEditable(supabase, id);
  if (lockErr) return { error: lockErr };

  const { error } = await supabase
    .from('purchase_orders')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/receiving');
  return { success: true };
}

// ── 삭제 ──

export async function deletePurchaseOrder(id: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/receiving');
  return { success: true };
}

// ── 품목 CRUD ──

export async function addPurchaseOrderItem(
  poId: string,
  productId: string,
  quantity: number,
  unitCost?: number,
) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const lockErr = await ensurePoEditable(supabase, poId);
  if (lockErr) return { error: lockErr };

  const { error } = await supabase.from('purchase_order_items').insert({
    purchase_order_id: poId,
    product_id: productId,
    quantity,
    unit_cost: unitCost ?? null,
    workspace_id: await getCurrentWorkspaceId(),
  });

  if (error) return { error: error.message };
  revalidatePath('/receiving');
  return { success: true };
}

export async function updatePurchaseOrderItem(
  itemId: string,
  data: { quantity?: number; unit_cost?: number; memo?: string },
) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const { data: item } = await supabase.from('purchase_order_items').select('purchase_order_id').eq('id', itemId).maybeSingle();
  if (!item) return { error: '품목을 찾을 수 없습니다' };
  const lockErr = await ensurePoEditable(supabase, item.purchase_order_id);
  if (lockErr) return { error: lockErr };

  const { error } = await supabase
    .from('purchase_order_items')
    .update(data)
    .eq('id', itemId);

  if (error) return { error: error.message };
  revalidatePath('/receiving');
  return { success: true };
}

export async function removePurchaseOrderItem(itemId: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const { data: item } = await supabase.from('purchase_order_items').select('purchase_order_id').eq('id', itemId).maybeSingle();
  if (!item) return { error: '품목을 찾을 수 없습니다' };
  const lockErr = await ensurePoEditable(supabase, item.purchase_order_id);
  if (lockErr) return { error: lockErr };

  const { error } = await supabase
    .from('purchase_order_items')
    .delete()
    .eq('id', itemId);

  if (error) return { error: error.message };
  revalidatePath('/receiving');
  return { success: true };
}

// ── 결제 이력 ──

export async function addPayment(
  poId: string,
  data: { amount: number; method?: string; paid_at: string; label?: string; memo?: string; attachment_url?: string },
) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase.from('purchase_order_payments').insert({
    purchase_order_id: poId,
    amount: data.amount,
    method: data.method ?? null,
    paid_at: data.paid_at,
    label: data.label ?? null,
    memo: data.memo ?? null,
    attachment_url: data.attachment_url ?? null,
    workspace_id: await getCurrentWorkspaceId(),
  });

  if (error) return { error: error.message };

  // payment_status 자동 업데이트
  await recalcPaymentStatus(poId);

  revalidatePath('/receiving');
  return { success: true };
}

export async function removePayment(paymentId: string, poId: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('purchase_order_payments')
    .delete()
    .eq('id', paymentId);

  if (error) return { error: error.message };

  await recalcPaymentStatus(poId);

  revalidatePath('/receiving');
  return { success: true };
}

// payment_status 자동 계산
async function recalcPaymentStatus(poId: string) {
  const supabase = await createClient();

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('total_amount')
    .eq('id', poId)
    .single();

  const { data: payments } = await supabase
    .from('purchase_order_payments')
    .select('amount')
    .eq('purchase_order_id', poId);

  const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
  const totalAmount = po?.total_amount ?? 0;

  let status = 'unpaid';
  if (totalPaid > 0 && totalAmount > 0 && totalPaid >= totalAmount) {
    status = 'paid';
  } else if (totalPaid > 0) {
    status = 'partial';
  }

  await supabase
    .from('purchase_orders')
    .update({ payment_status: status, updated_at: new Date().toISOString() })
    .eq('id', poId);
}
