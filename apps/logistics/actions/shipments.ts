'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// 출고건의 시리얼 배정 정보 조회
export async function getShipmentSerials(shipmentId: string) {
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

// 출고건의 시리얼 레벨·메모 조회
export async function getShipmentInfo(shipmentId: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('shipments')
    .select('id, serial_level, serial_source, memo, status, order_id')
    .eq('id', shipmentId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 제품의 가용 시리얼 조회 (물류가 선택용)
export async function getAvailableSerials(productId: string, limit = 50) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, serial_number, unit_barcode, manufacturer_serial, status')
    .eq('product_id', productId)
    .eq('status', 'in_stock')
    .order('serial_number', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

// 물류가 시리얼 배정 (serial_source = 'logistics')
export async function logisticsAssignSerial(
  shipmentId: string,
  serialId: string,
  productId: string,
) {
  const supabase = await createAdminClient();

  // 중복 체크
  const { data: existing } = await supabase
    .from('shipment_serials')
    .select('id')
    .eq('shipment_id', shipmentId)
    .eq('inventory_item_id', serialId);

  if (existing && existing.length > 0) {
    return { error: '이미 배정된 시리얼입니다' };
  }

  const { error: insErr } = await supabase
    .from('shipment_serials')
    .insert({
      shipment_id: shipmentId,
      inventory_item_id: serialId,
      product_id: productId,
      quantity: 1,
      assigned_by: 'logistics',
    });

  if (insErr) return { error: insErr.message };

  // 시리얼 상태 → reserved
  await supabase
    .from('inventory_items')
    .update({ status: 'reserved' })
    .eq('id', serialId);

  revalidatePath('/delivery');
  return { success: true };
}
