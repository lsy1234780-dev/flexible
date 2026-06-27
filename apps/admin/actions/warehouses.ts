'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { getChildType } from '@/lib/warehouseUtils';

// ── 창고 목록 조회 ──

export async function getWarehouses() {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

// ── 창고 상세 조회 ──

export async function getWarehouse(id: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── 창고 생성 ──

export async function createWarehouse(input: {
  name: string;
  code: string;
  address?: string;
  total_area?: number;
  usable_area?: number;
  warehouse_type?: string;
  manager_name?: string;
  manager_contact?: string;
  memo?: string;
}) {
  const supabase = await createAdminClient();

  if (!input.name.trim()) return { error: '창고명을 입력하세요' };
  if (!input.code.trim()) return { error: '창고 코드를 입력하세요' };

  const { data, error } = await supabase
    .from('warehouses')
    .insert({
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      address: input.address?.trim() || null,
      total_area: input.total_area || null,
      usable_area: input.usable_area || null,
      warehouse_type: input.warehouse_type || 'general',
      manager_name: input.manager_name?.trim() || null,
      manager_contact: input.manager_contact?.trim() || null,
      memo: input.memo?.trim() || null,
      workspace_id: await getCurrentWorkspaceId(),
    })
    .select('id, name, code')
    .single();

  if (error) {
    if (error.code === '23505') return { error: '이미 존재하는 창고 코드입니다' };
    return { error: error.message };
  }

  revalidatePath('/warehouses');
  return { success: true, id: data.id };
}

// ── 창고 수정 ──

export async function updateWarehouse(
  id: string,
  input: {
    name?: string;
    code?: string;
    address?: string;
    total_area?: number | null;
    usable_area?: number | null;
    warehouse_type?: string;
    manager_name?: string;
    manager_contact?: string;
    is_active?: boolean;
    memo?: string;
  },
) {
  const supabase = await createAdminClient();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.code !== undefined) updates.code = input.code.trim().toUpperCase();
  if (input.address !== undefined) updates.address = input.address?.trim() || null;
  if (input.total_area !== undefined) updates.total_area = input.total_area;
  if (input.usable_area !== undefined) updates.usable_area = input.usable_area;
  if (input.warehouse_type !== undefined) updates.warehouse_type = input.warehouse_type;
  if (input.manager_name !== undefined) updates.manager_name = input.manager_name?.trim() || null;
  if (input.manager_contact !== undefined) updates.manager_contact = input.manager_contact?.trim() || null;
  if (input.is_active !== undefined) updates.is_active = input.is_active;
  if (input.memo !== undefined) updates.memo = input.memo?.trim() || null;

  const { error } = await supabase
    .from('warehouses')
    .update(updates)
    .eq('id', id);

  if (error) {
    if (error.code === '23505') return { error: '이미 존재하는 창고 코드입니다' };
    return { error: error.message };
  }

  revalidatePath('/warehouses');
  return { success: true };
}

// ── 창고 삭제 ──

export async function deleteWarehouse(id: string) {
  const supabase = await createAdminClient();

  // 배정된 재고가 있는지 확인
  const { count } = await supabase
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('warehouse_id', id);

  if (count && count > 0) {
    return { error: `이 창고에 배정된 재고가 ${count}개 있습니다. 재고 배정을 먼저 해제하세요.` };
  }

  const { error } = await supabase
    .from('warehouses')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/warehouses');
  return { success: true };
}

// ── 로케이션 트리 조회 ──

export async function getLocationTree(warehouseId: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('warehouse_locations')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .order('sort_order')
    .order('code');

  if (error) throw new Error(error.message);

  // 플랫 목록을 트리로 변환
  return buildTree(data);
}

function buildTree(
  items: Array<{
    id: string;
    parent_id: string | null;
    [key: string]: unknown;
  }>,
) {
  const map = new Map<string, typeof items[0] & { children: typeof items }>();
  const roots: Array<typeof items[0] & { children: typeof items }> = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ── 로케이션 플랫 목록 조회 ──

export async function getLocations(warehouseId: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('warehouse_locations')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .order('depth')
    .order('sort_order')
    .order('code');

  if (error) throw new Error(error.message);
  return data;
}

// ── 로케이션 생성 ──

export async function createLocation(input: {
  warehouse_id: string;
  parent_id?: string | null;
  name: string;
  code: string;
  description?: string;
  sort_order?: number;
}) {
  const supabase = await createAdminClient();

  if (!input.name.trim()) return { error: '이름을 입력하세요' };
  if (!input.code.trim()) return { error: '코드를 입력하세요' };

  // type 자동 결정
  let type = 'zone';
  if (input.parent_id) {
    const { data: parent } = await supabase
      .from('warehouse_locations')
      .select('type')
      .eq('id', input.parent_id)
      .single();

    if (!parent) return { error: '부모 로케이션을 찾을 수 없습니다' };
    const childType = getChildType(parent.type);
    if (!childType) return { error: 'bin 하위에는 로케이션을 추가할 수 없습니다' };
    type = childType;
  }

  const { data, error } = await supabase
    .from('warehouse_locations')
    .insert({
      warehouse_id: input.warehouse_id,
      parent_id: input.parent_id || null,
      type,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description?.trim() || null,
      sort_order: input.sort_order ?? 0,
      workspace_id: await getCurrentWorkspaceId(),
    })
    .select('id, type, code, full_path')
    .single();

  if (error) {
    if (error.code === '23505') return { error: '동일한 코드가 이미 존재합니다' };
    return { error: error.message };
  }

  revalidatePath('/warehouses');
  return { success: true, id: data.id, type: data.type };
}

// ── 로케이션 수정 ──

export async function updateLocation(
  id: string,
  input: {
    name?: string;
    code?: string;
    description?: string;
    sort_order?: number;
    is_active?: boolean;
  },
) {
  const supabase = await createAdminClient();

  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.code !== undefined) updates.code = input.code.trim().toUpperCase();
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.sort_order !== undefined) updates.sort_order = input.sort_order;
  if (input.is_active !== undefined) updates.is_active = input.is_active;

  const { error } = await supabase
    .from('warehouse_locations')
    .update(updates)
    .eq('id', id);

  if (error) {
    if (error.code === '23505') return { error: '동일한 코드가 이미 존재합니다' };
    return { error: error.message };
  }

  revalidatePath('/warehouses');
  return { success: true };
}

// ── 로케이션 삭제 ──

export async function deleteLocation(id: string) {
  const supabase = await createAdminClient();

  // 배정된 재고 확인
  const { count } = await supabase
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', id);

  if (count && count > 0) {
    return { error: `이 로케이션에 배정된 재고가 ${count}개 있습니다. 재고 배정을 먼저 해제하세요.` };
  }

  // 하위 로케이션 확인
  const { count: childCount } = await supabase
    .from('warehouse_locations')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id);

  if (childCount && childCount > 0) {
    return { error: `하위 로케이션이 ${childCount}개 있습니다. 하위 항목을 먼저 삭제하세요.` };
  }

  const { error } = await supabase
    .from('warehouse_locations')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/warehouses');
  return { success: true };
}

// ── 창고/로케이션별 재고 조회 (시리얼 등록된 아이템) ──

export async function getInventoryAtLocation(
  warehouseId: string,
  locationId?: string | null,
) {
  const supabase = await createAdminClient();

  let query = supabase
    .from('inventory_items')
    .select('*, products(id, name, barcode)')
    .eq('warehouse_id', warehouseId)
    .eq('status', 'in_stock')
    .order('created_at', { ascending: false });

  if (locationId) {
    query = query.eq('location_id', locationId);
  } else {
    query = query.is('location_id', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// ── 벌크 재고 조회 (warehouse_inventory) ──

export async function getWarehouseInventory(
  warehouseId: string,
  locationId?: string | null,
) {
  const supabase = await createAdminClient();

  let query = supabase
    .from('warehouse_inventory')
    .select('*, products(id, name, barcode), warehouses(id, name, code), warehouse_locations(id, name, code, full_path)')
    .eq('warehouse_id', warehouseId)
    .order('created_at', { ascending: false });

  if (locationId) {
    query = query.eq('location_id', locationId);
  } else {
    query = query.is('location_id', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// ── 벌크 재고 추가/수량 변경 (upsert) ──

export async function upsertWarehouseInventory(input: {
  warehouse_id: string;
  location_id?: string | null;
  product_id: string;
  quantity: number;
  memo?: string;
}) {
  const supabase = await createAdminClient();

  // 기존 레코드 조회
  let query = supabase
    .from('warehouse_inventory')
    .select('id, quantity')
    .eq('warehouse_id', input.warehouse_id)
    .eq('product_id', input.product_id);

  if (input.location_id) {
    query = query.eq('location_id', input.location_id);
  } else {
    query = query.is('location_id', null);
  }

  const { data: existing } = await query.single();

  if (existing) {
    const newQty = existing.quantity + input.quantity;
    if (newQty < 0) return { error: '재고가 부족합니다' };

    if (newQty === 0) {
      // 수량 0이면 삭제
      const { error } = await supabase
        .from('warehouse_inventory')
        .delete()
        .eq('id', existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from('warehouse_inventory')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) return { error: error.message };
    }
  } else {
    if (input.quantity <= 0) return { error: '수량은 1 이상이어야 합니다' };

    const { error } = await supabase
      .from('warehouse_inventory')
      .insert({
        warehouse_id: input.warehouse_id,
        location_id: input.location_id || null,
        product_id: input.product_id,
        quantity: input.quantity,
        memo: input.memo || null,
        workspace_id: await getCurrentWorkspaceId(),
      });
    if (error) {
      if (error.code === '23505') return { error: '이미 동일한 위치에 해당 제품 재고가 있습니다' };
      return { error: error.message };
    }
  }

  revalidatePath('/warehouses');
  return { success: true };
}

// ── 벌크 → 시리얼 전환 (warehouse_inventory -N, inventory_items +N) ──

export async function convertBulkToSerials(input: {
  warehouse_inventory_id: string;
  quantity: number;
  warehouse_id: string;
  location_id?: string | null;
  product_id: string;
  lot_id?: string | null;
  generate_unit_barcode?: boolean;
}) {
  const supabase = await createAdminClient();

  // 벌크 재고 확인
  const { data: bulk } = await supabase
    .from('warehouse_inventory')
    .select('id, quantity')
    .eq('id', input.warehouse_inventory_id)
    .single();

  if (!bulk) return { error: '벌크 재고를 찾을 수 없습니다' };
  if (bulk.quantity < input.quantity) {
    return { error: `재고 부족 (현재: ${bulk.quantity}개, 요청: ${input.quantity}개)` };
  }

  // inventory_items 생성 (RPC — warehouse_id, location_id 포함)
  const { data: items, error: rpcError } = await supabase.rpc(
    'generate_inventory_items',
    {
      p_product_id: input.product_id,
      p_quantity: input.quantity,
      p_receiving_item_id: null,
      p_lot_id: input.lot_id ?? null,
      p_generate_unit_barcode: input.generate_unit_barcode ?? false,
      p_warehouse_id: input.warehouse_id,
      p_location_id: input.location_id ?? null,
    },
  );

  if (rpcError) return { error: `시리얼 생성 실패: ${rpcError.message}` };

  // 벌크 수량 차감
  const newQty = bulk.quantity - input.quantity;
  if (newQty === 0) {
    await supabase.from('warehouse_inventory').delete().eq('id', bulk.id);
  } else {
    await supabase
      .from('warehouse_inventory')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', bulk.id);
  }

  // inventory_movements 기록
  const createdItems = items as { item_id: string }[];
  if (createdItems.length > 0) {
    const workspaceId = await getCurrentWorkspaceId();
    await supabase.from('inventory_movements').insert(
      createdItems.map((item) => ({
        inventory_item_id: item.item_id,
        product_id: input.product_id,
        from_status: null,
        to_status: 'in_stock',
        quantity: 1,
        reason: '벌크→시리얼 전환',
        memo: null,
        workspace_id: workspaceId,
      })),
    );
  }

  revalidatePath('/warehouses');
  return { success: true, created: createdItems.length };
}

// ── 재고 아이템 로케이션 변경 ──

export async function moveInventoryItem(
  itemId: string,
  warehouseId: string,
  locationId?: string | null,
) {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('inventory_items')
    .update({
      warehouse_id: warehouseId,
      location_id: locationId || null,
    })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidatePath('/warehouses');
  revalidatePath('/serials');
  revalidatePath('/products');
  return { success: true };
}

// ── 재고 아이템 일괄 로케이션 변경 ──

export async function moveInventoryItemsBatch(
  itemIds: string[],
  warehouseId: string,
  locationId?: string | null,
) {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('inventory_items')
    .update({
      warehouse_id: warehouseId,
      location_id: locationId || null,
    })
    .in('id', itemIds);

  if (error) return { error: error.message };

  revalidatePath('/warehouses');
  revalidatePath('/serials');
  revalidatePath('/products');
  return { success: true };
}

// ── 창고 목록 (간략 - Select용) ──

export async function getWarehousesForSelect() {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(error.message);
  return data;
}

// ── 로케이션 목록 (간략 - Select용) ──

export async function getLocationsForSelect(warehouseId: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('warehouse_locations')
    .select('id, name, code, type, full_path, depth')
    .eq('warehouse_id', warehouseId)
    .eq('is_active', true)
    .order('depth')
    .order('sort_order')
    .order('code');

  if (error) throw new Error(error.message);
  return data;
}

// ── 로케이션 카운트 (창고별) ──

export async function getLocationCounts(warehouseId: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('warehouse_locations')
    .select('type')
    .eq('warehouse_id', warehouseId);

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const loc of data) {
    counts[loc.type] = (counts[loc.type] || 0) + 1;
  }
  return counts;
}

// ── 재고 위치 검색 (시리얼/바코드로 찾기) ──

export async function searchInventoryLocation(query: string) {
  const supabase = await createAdminClient();

  if (!query.trim()) return [];

  const q = query.trim();

  // serial_number는 정수일 수 있으므로 변환 시도
  const serialNum = /^\d+$/.test(q) ? parseInt(q, 10) : null;

  // inventory_items에서 unit_barcode, manufacturer_serial, serial_number로 검색
  let items;

  if (serialNum !== null) {
    // 숫자인 경우: serial_number OR unit_barcode OR manufacturer_serial
    const { data, error } = await supabase
      .from('inventory_items')
      .select(
        '*, products(id, name, barcode), warehouses:warehouse_id(id, name, code), warehouse_locations:location_id(id, name, code, full_path)',
      )
      .or(`serial_number.eq.${serialNum},unit_barcode.ilike.%${q}%,manufacturer_serial.ilike.%${q}%`)
      .limit(20);

    if (error) throw new Error(error.message);
    items = data;
  } else {
    // 문자열인 경우: unit_barcode OR manufacturer_serial
    const { data, error } = await supabase
      .from('inventory_items')
      .select(
        '*, products(id, name, barcode), warehouses:warehouse_id(id, name, code), warehouse_locations:location_id(id, name, code, full_path)',
      )
      .or(`unit_barcode.ilike.%${q}%,manufacturer_serial.ilike.%${q}%`)
      .limit(20);

    if (error) throw new Error(error.message);
    items = data;
  }

  // 제품 바코드로도 검색 (제품 자체 바코드 매칭)
  if (items.length === 0) {
    const { data: byProductBarcode, error } = await supabase
      .from('inventory_items')
      .select(
        '*, products!inner(id, name, barcode), warehouses:warehouse_id(id, name, code), warehouse_locations:location_id(id, name, code, full_path)',
      )
      .ilike('products.barcode', `%${q}%`)
      .eq('status', 'in_stock')
      .limit(20);

    if (!error && byProductBarcode) items = byProductBarcode;
  }

  return items;
}
