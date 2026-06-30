'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import dayjs from 'dayjs';

// LOT 번호 자동생성 (LOT-YYMMDD 형태, 제조일 기준)
function generateLotNumber(manufacturedAt: string): string {
  return `LOT-${dayjs(manufacturedAt).format('YYMMDD')}`;
}

// ── LOT 목록 조회 ──

export async function getLots(productId?: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  let query = supabase
    .from('product_lots')
    .select(`
      id, lot_number, product_id, manufactured_at, received_at, quantity, memo, created_at,
      products(name, barcode)
    `)
    .order('created_at', { ascending: false });

  if (productId) {
    query = query.eq('product_id', productId);
  }

  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return data;
}

// ── LOT 단건 조회 ──

export async function getLot(lotId: string) {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_lots')
    .select(`
      id, lot_number, product_id, manufactured_at, received_at, quantity, memo, created_at,
      products(name, barcode)
    `)
    .eq('id', lotId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── LOT 생성 ──

export async function createLot(input: {
  product_id: string;
  manufactured_at: string;  // YYYY-MM-DD
  received_at?: string;     // YYYY-MM-DD
  quantity: number;
  memo?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  if (!input.product_id) return { error: '제품을 선택하세요' };
  if (!input.manufactured_at) return { error: '제조일을 입력하세요' };
  if (input.quantity <= 0) return { error: '수량은 1 이상이어야 합니다' };

  const lotNumber = generateLotNumber(input.manufactured_at);

  const { data, error } = await supabase
    .from('product_lots')
    .insert({
      product_id: input.product_id,
      lot_number: lotNumber,
      manufactured_at: input.manufactured_at,
      received_at: input.received_at || null,
      quantity: input.quantity,
      memo: input.memo?.trim() || null,
      workspace_id: await getCurrentWorkspaceId(),
    })
    .select('id, lot_number')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/lots');
  return { success: true, id: data.id, lot_number: data.lot_number };
}

// ── LOT 수정 ──

export async function updateLot(
  lotId: string,
  input: {
    manufactured_at?: string;
    received_at?: string;
    quantity?: number;
    memo?: string;
  },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const updates: Record<string, unknown> = {};

  if (input.manufactured_at) {
    updates.manufactured_at = input.manufactured_at;
    updates.lot_number = generateLotNumber(input.manufactured_at);
  }
  if (input.received_at !== undefined) {
    updates.received_at = input.received_at || null;
  }
  if (input.quantity !== undefined) {
    updates.quantity = input.quantity;
  }
  if (input.memo !== undefined) {
    updates.memo = input.memo?.trim() || null;
  }

  const { error } = await supabase
    .from('product_lots')
    .update(updates)
    .eq('id', lotId);

  if (error) return { error: error.message };

  revalidatePath('/lots');
  return { success: true };
}

// ── LOT 삭제 ──

export async function deleteLot(lotId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  // 해당 LOT에 연결된 시리얼이 있는지 확인
  const { count } = await supabase
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('lot_id', lotId);

  if (count && count > 0) {
    return { error: `이 LOT에 연결된 시리얼이 ${count}개 있습니다. 시리얼 연결을 먼저 해제하세요.` };
  }

  const { error } = await supabase
    .from('product_lots')
    .delete()
    .eq('id', lotId);

  if (error) return { error: error.message };

  revalidatePath('/lots');
  return { success: true };
}

// ── LOT별 시리얼 조회 ──

export async function getSerialsByLot(lotId: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, unit_barcode, serial_number, status, created_at')
    .eq('lot_id', lotId)
    .order('serial_number');

  if (error) throw new Error(error.message);
  return data;
}

// ── 선입선출 출고 추천 (특정 제품의 가장 오래된 LOT 시리얼부터) ──

export async function getFifoSerials(productId: string, quantity: number) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      id, unit_barcode, serial_number, status,
      product_lots(lot_number, received_at, manufactured_at)
    `)
    .eq('product_id', productId)
    .eq('status', 'in_stock')
    .not('lot_id', 'is', null)
    .order('received_at', { referencedTable: 'product_lots', ascending: true })
    .limit(quantity);

  if (error) throw new Error(error.message);
  return data;
}
