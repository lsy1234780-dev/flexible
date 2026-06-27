'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';

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
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, title, supplier_id, supplier, supplier_contact,
      total_amount, currency, exchange_rate, vat_amount,
      payment_status, memo, created_by, created_at, updated_at,
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
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, title, supplier_id, supplier, supplier_contact,
      total_amount, currency, exchange_rate, vat_amount,
      payment_status, memo, created_by, created_at, updated_at,
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

// ── 생성 ──

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  const supabase = await createAdminClient();
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
  const supabase = await createAdminClient();

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
  const supabase = await createAdminClient();

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
  const supabase = await createAdminClient();

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
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('purchase_order_items')
    .update(data)
    .eq('id', itemId);

  if (error) return { error: error.message };
  revalidatePath('/receiving');
  return { success: true };
}

export async function removePurchaseOrderItem(itemId: string) {
  const supabase = await createAdminClient();

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
  const supabase = await createAdminClient();

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
  const supabase = await createAdminClient();

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
  const supabase = await createAdminClient();

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
