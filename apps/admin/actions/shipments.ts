'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';

// ── 출고 시리얼 배정 ──

// 출고건 상세 (시리얼 배정 패널용)
export async function getShipmentDetail(orderId: string) {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, company_id,
      companies(id, name),
      order_items(id, product_id, quantity, unit_price,
        products(id, name, barcode, serial_mode, base_stock)
      ),
      shipments!order_id(id, serial_level, serial_source, memo)
    `)
    .eq('id', orderId)
    .single();

  if (!order) throw new Error('주문을 찾을 수 없습니다');
  return order;
}

// 특정 제품의 재고 시리얼 목록 (출고 배정용)
export async function getAvailableSerials(
  productId: string,
  limit = 100,
) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      id, serial_number, unit_barcode, manufacturer_serial, status,
      product_lots(lot_number, manufactured_at, received_at)
    `)
    .eq('product_id', productId)
    .eq('status', 'in_stock')
    .order('serial_number', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

// FIFO 자동 배정 (pool 모드)
export async function autoAssignSerials(
  shipmentId: string,
  productId: string,
  quantity: number,
) {
  const supabase = await createAdminClient();

  // LOT received_at 기준 FIFO
  const { data: serials, error } = await supabase
    .from('inventory_items')
    .select(`
      id, serial_number, unit_barcode,
      product_lots(received_at)
    `)
    .eq('product_id', productId)
    .eq('status', 'in_stock')
    .order('serial_number', { ascending: true })
    .limit(quantity);

  if (error) return { error: error.message };
  if (!serials || serials.length < quantity) {
    return { error: `재고 시리얼 부족 (필요: ${quantity}, 가용: ${serials?.length ?? 0})` };
  }

  // shipment_serials에 배정
  const workspaceId = await getCurrentWorkspaceId();
  const inserts = serials.map((s) => ({
    shipment_id: shipmentId,
    inventory_item_id: s.id,
    product_id: productId,
    quantity: 1,
    assigned_by: 'auto' as const,
    workspace_id: workspaceId,
  }));

  const { error: insErr } = await supabase
    .from('shipment_serials')
    .insert(inserts);

  if (insErr) return { error: insErr.message };

  // 시리얼 상태 → reserved
  for (const s of serials) {
    await supabase
      .from('inventory_items')
      .update({ status: 'reserved' })
      .eq('id', s.id);
  }

  return { success: true, count: serials.length };
}

// 수동 시리얼 배정 (어드민이 선택)
interface AssignItem {
  inventory_item_id: string;
  product_id: string;
}

export async function assignSerials(
  shipmentId: string,
  items: AssignItem[],
) {
  const supabase = await createAdminClient();

  if (items.length === 0) return { error: '배정할 시리얼이 없습니다' };

  // 중복 체크
  const serialIds = items.map((i) => i.inventory_item_id);
  const unique = new Set(serialIds);
  if (unique.size !== serialIds.length) {
    return { error: '중복된 시리얼이 있습니다' };
  }

  // 이미 배정된 시리얼 체크
  const { data: existing } = await supabase
    .from('shipment_serials')
    .select('inventory_item_id')
    .eq('shipment_id', shipmentId)
    .in('inventory_item_id', serialIds);

  if (existing && existing.length > 0) {
    return { error: `이미 배정된 시리얼이 ${existing.length}건 있습니다` };
  }

  // 배정
  const workspaceId = await getCurrentWorkspaceId();
  const inserts = items.map((i) => ({
    shipment_id: shipmentId,
    inventory_item_id: i.inventory_item_id,
    product_id: i.product_id,
    quantity: 1,
    assigned_by: 'admin' as const,
    workspace_id: workspaceId,
  }));

  const { error: insErr } = await supabase
    .from('shipment_serials')
    .insert(inserts);

  if (insErr) return { error: insErr.message };

  // 시리얼 상태 → reserved
  for (const id of serialIds) {
    await supabase
      .from('inventory_items')
      .update({ status: 'reserved' })
      .eq('id', id);
  }

  revalidatePath('/orders');
  return { success: true, count: items.length };
}

// 직접 입력: 시리얼 번호 텍스트로 검색 → 배정
export async function assignSerialsByText(
  shipmentId: string,
  productId: string,
  serialTexts: string[],
) {
  const supabase = await createAdminClient();

  if (serialTexts.length === 0) return { error: '입력된 시리얼이 없습니다' };

  // 중복 제거
  const uniqueTexts = [...new Set(serialTexts.map((t) => t.trim()).filter(Boolean))];
  if (uniqueTexts.length === 0) return { error: '유효한 시리얼이 없습니다' };

  // manufacturer_serial, unit_barcode, serial_number로 검색
  const { data: found, error: searchErr } = await supabase
    .from('inventory_items')
    .select('id, serial_number, unit_barcode, manufacturer_serial, status')
    .eq('product_id', productId)
    .or(
      uniqueTexts.map((t) =>
        `manufacturer_serial.eq.${t},unit_barcode.eq.${t}`,
      ).join(','),
    );

  if (searchErr) return { error: searchErr.message };
  if (!found || found.length === 0) {
    return { error: '일치하는 시리얼을 찾을 수 없습니다. 제조사 시리얼 또는 개별 바코드를 확인하세요.' };
  }

  // 이미 배정된 시리얼 필터
  const { data: existing } = await supabase
    .from('shipment_serials')
    .select('inventory_item_id')
    .eq('shipment_id', shipmentId)
    .in('inventory_item_id', found.map((f) => f.id));

  const existingIds = new Set((existing ?? []).map((e) => e.inventory_item_id));
  const assignable = found.filter((f) => !existingIds.has(f.id));

  if (assignable.length === 0) {
    return { error: '모든 시리얼이 이미 배정되어 있습니다' };
  }

  // 배정
  const workspaceId = await getCurrentWorkspaceId();
  const inserts = assignable.map((s) => ({
    shipment_id: shipmentId,
    inventory_item_id: s.id,
    product_id: productId,
    quantity: 1,
    assigned_by: 'admin' as const,
    workspace_id: workspaceId,
  }));

  const { error: insErr } = await supabase
    .from('shipment_serials')
    .insert(inserts);

  if (insErr) return { error: insErr.message };

  // 시리얼 상태 → reserved
  for (const s of assignable) {
    await supabase
      .from('inventory_items')
      .update({ status: 'reserved' })
      .eq('id', s.id);
  }

  // 못 찾은 시리얼 목록
  const foundTexts = new Set(
    found.flatMap((f) => [f.manufacturer_serial, f.unit_barcode].filter(Boolean)),
  );
  const notFound = uniqueTexts.filter((t) => !foundTexts.has(t));

  revalidatePath('/orders');
  return {
    success: true,
    assigned: assignable.length,
    skipped: existingIds.size,
    notFound,
  };
}

// 제품 무관 일괄 매칭: 시리얼 번호로 검색 → 제품 자동 감지 → 배정 (L1용)
export async function matchSerialsAcrossProducts(
  shipmentId: string,
  serialTexts: string[],
) {
  const supabase = await createAdminClient();

  if (serialTexts.length === 0) return { error: '입력된 시리얼이 없습니다' };

  const uniqueTexts = [...new Set(serialTexts.map((t) => t.trim()).filter(Boolean))];
  if (uniqueTexts.length === 0) return { error: '유효한 시리얼이 없습니다' };

  // 제품 필터 없이 전체 검색
  const { data: found, error: searchErr } = await supabase
    .from('inventory_items')
    .select('id, serial_number, unit_barcode, manufacturer_serial, status, product_id')
    .or(
      uniqueTexts.map((t) =>
        `manufacturer_serial.eq.${t},unit_barcode.eq.${t}`,
      ).join(','),
    );

  if (searchErr) return { error: searchErr.message };
  if (!found || found.length === 0) {
    return { error: '일치하는 시리얼을 찾을 수 없습니다.' };
  }

  // 이미 배정된 시리얼 필터
  const { data: existing } = await supabase
    .from('shipment_serials')
    .select('inventory_item_id')
    .eq('shipment_id', shipmentId)
    .in('inventory_item_id', found.map((f) => f.id));

  const existingIds = new Set((existing ?? []).map((e) => e.inventory_item_id));
  const assignable = found.filter((f) => !existingIds.has(f.id));

  if (assignable.length === 0) {
    return { error: '모든 시리얼이 이미 배정되어 있습니다' };
  }

  // 배정 (product_id는 시리얼에서 자동 감지)
  const workspaceId = await getCurrentWorkspaceId();
  const inserts = assignable.map((s) => ({
    shipment_id: shipmentId,
    inventory_item_id: s.id,
    product_id: s.product_id,
    quantity: 1,
    assigned_by: 'admin' as const,
    workspace_id: workspaceId,
  }));

  const { error: insErr } = await supabase
    .from('shipment_serials')
    .insert(inserts);

  if (insErr) return { error: insErr.message };

  // 시리얼 상태 → reserved
  for (const s of assignable) {
    await supabase
      .from('inventory_items')
      .update({ status: 'reserved' })
      .eq('id', s.id);
  }

  // 못 찾은 시리얼 목록
  const foundTexts = new Set(
    found.flatMap((f) => [f.manufacturer_serial, f.unit_barcode].filter(Boolean)),
  );
  const notFound = uniqueTexts.filter((t) => !foundTexts.has(t));

  revalidatePath('/orders');
  return {
    success: true,
    assigned: assignable.length,
    skipped: existingIds.size,
    notFound,
  };
}

// none 모드 제품: 시리얼 없이 수량만 배정
export async function assignQuantityOnly(
  shipmentId: string,
  productId: string,
  quantity: number,
) {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('shipment_serials')
    .insert({
      shipment_id: shipmentId,
      inventory_item_id: null,
      product_id: productId,
      quantity,
      assigned_by: 'admin',
      workspace_id: await getCurrentWorkspaceId(),
    });

  if (error) return { error: error.message };

  revalidatePath('/orders');
  return { success: true };
}

// 시리얼 배정 해제
export async function unassignSerial(
  shipmentSerialId: string,
) {
  const supabase = await createAdminClient();

  const { data: ss } = await supabase
    .from('shipment_serials')
    .select('id, inventory_item_id')
    .eq('id', shipmentSerialId)
    .single();

  if (!ss) return { error: '배정 내역을 찾을 수 없습니다' };

  // 삭제
  await supabase
    .from('shipment_serials')
    .delete()
    .eq('id', shipmentSerialId);

  // 시리얼 상태 복원
  if (ss.inventory_item_id) {
    await supabase
      .from('inventory_items')
      .update({ status: 'in_stock' })
      .eq('id', ss.inventory_item_id);
  }

  revalidatePath('/orders');
  return { success: true };
}

// 출고건의 배정된 시리얼 목록 조회
export async function getShipmentSerials(shipmentId: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('shipment_serials')
    .select(`
      id, quantity, assigned_by, created_at,
      inventory_items(id, serial_number, unit_barcode, manufacturer_serial),
      products(id, name, barcode, serial_mode)
    `)
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

// 출고건의 배정된 시리얼 수 조회
export async function getShipmentSerialCount(shipmentId: string) {
  if (process.env.PREVIEW_MODE === 'true') return { count: 0 };
  const supabase = await createAdminClient();

  const { count, error } = await supabase
    .from('shipment_serials')
    .select('id', { count: 'exact', head: true })
    .eq('shipment_id', shipmentId);

  if (error) return { error: error.message };
  return { count: count ?? 0 };
}

// 출고건의 모든 시리얼 배정 초기화
export async function clearAllShipmentSerials(shipmentId: string) {
  const supabase = await createAdminClient();

  // 배정된 시리얼 ID 조회
  const { data: assigned, error: fetchErr } = await supabase
    .from('shipment_serials')
    .select('id, inventory_item_id')
    .eq('shipment_id', shipmentId);

  if (fetchErr) return { error: fetchErr.message };
  if (!assigned || assigned.length === 0) return { success: true, cleared: 0 };

  // shipment_serials 삭제
  const { error: delErr } = await supabase
    .from('shipment_serials')
    .delete()
    .eq('shipment_id', shipmentId);

  if (delErr) return { error: delErr.message };

  // 시리얼 상태 복원 (inventory_item_id가 있는 것만)
  const serialIds = assigned.filter((a) => a.inventory_item_id).map((a) => a.inventory_item_id!);
  for (const sid of serialIds) {
    await supabase
      .from('inventory_items')
      .update({ status: 'in_stock' })
      .eq('id', sid);
  }

  revalidatePath('/orders');
  return { success: true, cleared: assigned.length };
}

// serial_level 업데이트 (L0~L3, 모드 변경 시 기존 배정 자동 초기화)
export type SerialLevel = 'L0' | 'L1' | 'L2' | 'L3';

export async function updateSerialLevel(
  shipmentId: string,
  level: SerialLevel,
) {
  const supabase = await createAdminClient();

  // 기존 배정이 있으면 먼저 초기화
  const { count } = await supabase
    .from('shipment_serials')
    .select('id', { count: 'exact', head: true })
    .eq('shipment_id', shipmentId);

  let cleared = 0;
  if (count && count > 0) {
    const result = await clearAllShipmentSerials(shipmentId);
    if (result.error) return { error: result.error };
    cleared = result.cleared ?? 0;
  }

  const { error } = await supabase
    .from('shipments')
    .update({ serial_level: level })
    .eq('id', shipmentId);

  if (error) return { error: error.message };

  revalidatePath('/orders');
  return { success: true, cleared };
}
