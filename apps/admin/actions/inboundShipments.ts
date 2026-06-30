'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { getStageConfig } from '@/lib/inboundStages';

// ── 타입 ──

export interface InboundShipment {
  id: string;
  title: string;
  stage: string;
  purchase_order_id: string | null;
  shipping_type: string | null;
  bl_number: string | null;
  container_number: string | null;
  origin_country: string | null;
  carrier: string | null;
  tracking_number: string | null;
  vehicle_number: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  customs_status: string | null;
  customs_amount: number | null;
  customs_cleared_at: string | null;
  receiving_order_id: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // 조인
  purchase_orders: { id: string; title: string; supplier: string | null; payment_status: string | null } | null;
  inbound_shipment_items: {
    id: string;
    product_id: string;
    quantity: number;
    unit_cost: number | null;
    memo: string | null;
    products: { name: string; barcode: string } | null;
  }[];
}

export interface InboundShipmentDetail extends InboundShipment {
  inbound_shipment_events: {
    id: string;
    event_type: string;
    title: string;
    description: string | null;
    from_stage: string | null;
    to_stage: string | null;
    created_by: string | null;
    created_at: string;
  }[];
}

export interface CreateShipmentInput {
  title: string;
  stage?: string;
  purchase_order_id?: string;
  shipping_type?: string;
  bl_number?: string;
  container_number?: string;
  origin_country?: string;
  carrier?: string;
  tracking_number?: string;
  vehicle_number?: string;
  estimated_arrival?: string;
  memo?: string;
  items?: { product_id: string; quantity: number; unit_cost?: number }[];
}

export interface UpdateShipmentInput {
  title?: string;
  shipping_type?: string;
  bl_number?: string;
  container_number?: string;
  origin_country?: string;
  carrier?: string;
  tracking_number?: string;
  vehicle_number?: string;
  estimated_arrival?: string;
  actual_arrival?: string;
  customs_status?: string;
  customs_amount?: number;
  customs_cleared_at?: string;
  memo?: string;
}

// ── 목록 조회 ──

export async function getInboundShipments(stageFilter?: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  let query = supabase
    .from('inbound_shipments')
    .select(`
      id, title, stage, purchase_order_id, shipping_type,
      bl_number, container_number, origin_country, carrier, tracking_number, vehicle_number,
      estimated_arrival, actual_arrival,
      customs_status, customs_amount, customs_cleared_at,
      receiving_order_id, memo, created_by, created_at, updated_at,
      purchase_orders(id, title, supplier, payment_status),
      inbound_shipment_items(
        id, product_id, quantity, unit_cost, memo,
        products(name, barcode)
      )
    `)
    .order('created_at', { ascending: false });

  if (stageFilter) {
    query = query.eq('stage', stageFilter);
  }

  const { data, error } = await query.limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InboundShipment[];
}

// ── 스테이지별 건수 ──

export async function getInboundShipmentCounts() {
  if (process.env.PREVIEW_MODE === 'true') return {};
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inbound_shipments')
    .select('stage');

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.stage] = (counts[row.stage] ?? 0) + 1;
  }
  return counts;
}

// ── 상세 조회 ──

export async function getInboundShipmentDetail(id: string) {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inbound_shipments')
    .select(`
      id, title, stage, purchase_order_id, shipping_type,
      bl_number, container_number, origin_country, carrier, tracking_number, vehicle_number,
      estimated_arrival, actual_arrival,
      customs_status, customs_amount, customs_cleared_at,
      receiving_order_id, memo, created_by, created_at, updated_at,
      purchase_orders(id, title, supplier, payment_status),
      inbound_shipment_items(
        id, product_id, quantity, unit_cost, memo,
        products(name, barcode)
      ),
      inbound_shipment_events(
        id, event_type, title, description, from_stage, to_stage, created_by, created_at
      )
    `)
    .eq('id', id)
    .order('created_at', { referencedTable: 'inbound_shipment_events', ascending: false })
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as InboundShipmentDetail;
}

// ── 생성 ──

export async function createInboundShipment(input: CreateShipmentInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };
  const workspaceId = await getCurrentWorkspaceId();

  // BL번호 중복 체크
  if (input.bl_number) {
    const { data: existing } = await supabase
      .from('inbound_shipments')
      .select('id')
      .eq('bl_number', input.bl_number)
      .maybeSingle();
    if (existing) return { error: `B/L번호 "${input.bl_number}"가 이미 등록되어 있습니다` };
  }

  const { data: shipment, error } = await supabase
    .from('inbound_shipments')
    .insert({
      title: input.title,
      stage: input.stage ?? 'in_transit',
      purchase_order_id: input.purchase_order_id ?? null,
      shipping_type: input.shipping_type ?? null,
      bl_number: input.bl_number ?? null,
      container_number: input.container_number ?? null,
      origin_country: input.origin_country ?? null,
      carrier: input.carrier ?? null,
      tracking_number: input.tracking_number ?? null,
      vehicle_number: input.vehicle_number ?? null,
      estimated_arrival: input.estimated_arrival ?? null,
      memo: input.memo ?? null,
      workspace_id: workspaceId,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  // 품목 추가
  if (input.items && input.items.length > 0) {
    const { error: itemErr } = await supabase
      .from('inbound_shipment_items')
      .insert(
        input.items.map((item) => ({
          shipment_id: shipment.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost ?? null,
          workspace_id: workspaceId,
        })),
      );
    if (itemErr) return { error: itemErr.message };
  }

  // 생성 이벤트
  const stageConfig = getStageConfig(input.stage ?? 'in_transit');
  await supabase.from('inbound_shipment_events').insert({
    shipment_id: shipment.id,
    event_type: 'stage_change',
    title: `${stageConfig.label} 등록`,
    to_stage: input.stage ?? 'in_transit',
    workspace_id: workspaceId,
  });

  revalidatePath('/receiving');
  return { success: true, id: shipment.id };
}

// ── 수정 ──

export async function updateInboundShipment(id: string, input: UpdateShipmentInput | Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  // BL번호 중복 체크
  const blNumber = (input as Record<string, unknown>).bl_number;
  if (blNumber && typeof blNumber === 'string') {
    const { data: existing } = await supabase
      .from('inbound_shipments')
      .select('id')
      .eq('bl_number', blNumber)
      .neq('id', id)
      .maybeSingle();
    if (existing) return { error: `B/L번호 "${blNumber}"가 이미 등록되어 있습니다` };
  }

  const { error } = await supabase
    .from('inbound_shipments')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/receiving');
  return { success: true };
}

// ── 삭제 ──

export async function deleteInboundShipment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('inbound_shipments')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/receiving');
  return { success: true };
}

// ── 스테이지 변경 ──

export async function changeShipmentStage(id: string, newStage: string, memo?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { data: current, error: fetchErr } = await supabase
    .from('inbound_shipments')
    .select('stage')
    .eq('id', id)
    .single();

  if (fetchErr) return { error: fetchErr.message };

  const oldStage = current.stage;
  if (oldStage === newStage) return { error: '동일한 스테이지입니다' };

  const updateData: Record<string, unknown> = {
    stage: newStage,
    updated_at: new Date().toISOString(),
  };

  if (newStage === 'arrived' || newStage === 'completed') {
    updateData.actual_arrival = new Date().toISOString().split('T')[0];
  }

  const { error } = await supabase
    .from('inbound_shipments')
    .update(updateData)
    .eq('id', id);

  if (error) return { error: error.message };

  const newConfig = getStageConfig(newStage);
  await supabase.from('inbound_shipment_events').insert({
    shipment_id: id,
    event_type: 'stage_change',
    title: `${newConfig.label}`,
    description: memo ?? null,
    from_stage: oldStage,
    to_stage: newStage,
    workspace_id: await getCurrentWorkspaceId(),
  });

  revalidatePath('/receiving');
  return { success: true };
}

// ── 품목 CRUD ──

export async function addShipmentItem(
  shipmentId: string,
  productId: string,
  quantity: number,
  unitCost?: number,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase.from('inbound_shipment_items').insert({
    shipment_id: shipmentId,
    product_id: productId,
    quantity,
    unit_cost: unitCost ?? null,
    workspace_id: await getCurrentWorkspaceId(),
  });

  if (error) return { error: error.message };
  revalidatePath('/receiving');
  return { success: true };
}

export async function updateShipmentItem(
  itemId: string,
  data: { quantity?: number; unit_cost?: number; memo?: string },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('inbound_shipment_items')
    .update(data)
    .eq('id', itemId);

  if (error) return { error: error.message };
  revalidatePath('/receiving');
  return { success: true };
}

export async function removeShipmentItem(itemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('inbound_shipment_items')
    .delete()
    .eq('id', itemId);

  if (error) return { error: error.message };
  revalidatePath('/receiving');
  return { success: true };
}

// ── 이벤트 ──

export async function addShipmentEvent(
  shipmentId: string,
  title: string,
  description?: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase.from('inbound_shipment_events').insert({
    shipment_id: shipmentId,
    event_type: 'memo',
    title,
    description: description ?? null,
    workspace_id: await getCurrentWorkspaceId(),
  });

  if (error) return { error: error.message };
  revalidatePath('/receiving');
  return { success: true };
}

// ── 입고지시서 연결 ──

export async function linkReceivingOrder(shipmentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { data: shipment, error: fetchErr } = await supabase
    .from('inbound_shipments')
    .select('id, title, receiving_order_id, inbound_shipment_items(product_id, quantity)')
    .eq('id', shipmentId)
    .single();

  if (fetchErr) return { error: fetchErr.message };
  if (shipment.receiving_order_id) {
    return { success: true, receivingOrderId: shipment.receiving_order_id };
  }

  const items = shipment.inbound_shipment_items as unknown as {
    product_id: string;
    quantity: number;
  }[];

  if (!items || items.length === 0) {
    return { error: '품목이 없습니다' };
  }

  const workspaceId = await getCurrentWorkspaceId();

  const { data: order, error: orderErr } = await supabase
    .from('receiving_orders')
    .insert({ title: shipment.title, status: 'pending', workspace_id: workspaceId })
    .select('id')
    .single();

  if (orderErr) return { error: orderErr.message };

  const { error: itemErr } = await supabase.from('receiving_items').insert(
    items.map((item) => ({
      receiving_order_id: order.id,
      product_id: item.product_id,
      expected_quantity: item.quantity,
      received_quantity: 0,
      workspace_id: workspaceId,
    })),
  );

  if (itemErr) return { error: itemErr.message };

  await supabase
    .from('inbound_shipments')
    .update({ receiving_order_id: order.id, updated_at: new Date().toISOString() })
    .eq('id', shipmentId);

  await supabase.from('inbound_shipment_events').insert({
    shipment_id: shipmentId,
    event_type: 'memo',
    title: '입고지시서 자동 생성',
    description: `입고지시서 #${order.id.slice(0, 8)} 생성됨`,
    workspace_id: workspaceId,
  });

  revalidatePath('/receiving');
  return { success: true, receivingOrderId: order.id };
}
