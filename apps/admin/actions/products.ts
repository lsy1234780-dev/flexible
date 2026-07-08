'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import dayjs from 'dayjs';

const ProductSchema = z.object({
  name: z.string().min(1, '제품명을 입력하세요'),
  barcode: z.string().min(1, '바코드를 입력하세요'),
  cost_price: z.coerce.number().min(0, '원가는 0 이상이어야 합니다').default(0),
  base_price: z.coerce.number().min(0, '단가는 0 이상이어야 합니다'),
  base_stock: z.coerce.number().min(0, '재고는 0 이상이어야 합니다').default(0),
  is_visible_default: z.boolean().default(true),
  width_cm: z.coerce.number().positive().nullable().default(null),
  height_cm: z.coerce.number().positive().nullable().default(null),
  depth_cm: z.coerce.number().positive().nullable().default(null),
  weight_kg: z.coerce.number().positive().nullable().default(null),
  image_url: z.string().url().nullable().default(null),
  description: z.string().nullable().default(null),
  category_id: z.string().uuid().nullable().default(null),
});

export async function getProducts() {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_PRODUCTS } = await import('@/lib/previewData');
    return PREVIEW_PRODUCTS;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(id, name)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getProduct(id: string) {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_PRODUCTS } = await import('@/lib/previewData');
    const p = PREVIEW_PRODUCTS.find((p) => p.id === id);
    return p ? { ...p, inventory_logs: [] } : null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(id, name), inventory_logs(*, scanned_by)')
    .eq('id', id)
    .order('created_at', { ascending: false, referencedTable: 'inventory_logs' })
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createProduct(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const parsed = ProductSchema.safeParse({
    name: formData.get('name'),
    barcode: formData.get('barcode'),
    cost_price: formData.get('cost_price'),
    base_price: formData.get('base_price'),
    base_stock: formData.get('base_stock'),
    is_visible_default: formData.get('is_visible_default') === 'true',
    width_cm: formData.get('width_cm') || null,
    height_cm: formData.get('height_cm') || null,
    depth_cm: formData.get('depth_cm') || null,
    weight_kg: formData.get('weight_kg') || null,
    image_url: String(formData.get('image_url') ?? '').trim() || null,
    description: String(formData.get('description') ?? '').trim() || null,
    category_id: formData.get('category_id') || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // 멀티테넌시: 모든 INSERT는 현재 워크스페이스로 귀속 (DB 055 NOT NULL 안전망)
  const workspaceId = await getCurrentWorkspaceId();

  const { data: product, error } = await supabase
    .from('products')
    .insert({ ...parsed.data, workspace_id: workspaceId })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { error: '이미 존재하는 바코드입니다' };
    return { error: error.message };
  }

  // base_stock > 0이면 inventory_items 생성 + LOT 자동 부여 + 입출고 이력 기록
  if (parsed.data.base_stock > 0 && product) {
    const adminClient = await createClient();
    const today = dayjs();
    const lotNumber = `LOT-${today.format('YYMMDD')}`;

    // LOT 생성
    const { data: lot } = await adminClient
      .from('product_lots')
      .insert({
        product_id: product.id,
        lot_number: lotNumber,
        manufactured_at: today.format('YYYY-MM-DD'),
        received_at: today.format('YYYY-MM-DD'),
        quantity: parsed.data.base_stock,
        memo: '제품 등록 시 초기재고',
        workspace_id: workspaceId,
      })
      .select('id')
      .single();

    // 창고 지정 (선택)
    const warehouseId = String(formData.get('warehouse_id') ?? '').trim() || null;
    const locationId = String(formData.get('location_id') ?? '').trim() || null;

    // inventory_items 생성 (RPC)
    const { data: createdItems } = await adminClient.rpc('generate_inventory_items', {
      p_product_id: product.id,
      p_quantity: parsed.data.base_stock,
      p_receiving_item_id: null,
      p_lot_id: lot?.id ?? null,
      p_generate_unit_barcode: false,
      p_warehouse_id: warehouseId,
      p_location_id: locationId,
    });

    // inventory_movements 기록 (개별 아이템 단위)
    if (createdItems && Array.isArray(createdItems)) {
      const movements = createdItems.map((item: { item_id: string }) => ({
        inventory_item_id: item.item_id,
        type: 'in' as const,
        reason: 'initial_stock',
        note: '제품 등록 시 초기재고 입고',
        workspace_id: workspaceId,
      }));

      if (movements.length > 0) {
        await adminClient.from('inventory_movements').insert(movements);
      }
    }

    // inventory_logs 기록 (제품 단위 집계 이력)
    await adminClient.from('inventory_logs').insert({
      product_id: product.id,
      quantity: parsed.data.base_stock,
      type: 'in',
      memo: `최초재고 입고 (${parsed.data.base_stock}개, ${lotNumber})`,
      workspace_id: workspaceId,
    });
  }

  revalidatePath('/products');
  return { success: true };
}

export async function updateProduct(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const UpdateSchema = ProductSchema.omit({ base_stock: true });
  const parsed = UpdateSchema.safeParse({
    name: formData.get('name'),
    barcode: formData.get('barcode'),
    cost_price: formData.get('cost_price'),
    base_price: formData.get('base_price'),
    is_visible_default: formData.get('is_visible_default') === 'true',
    width_cm: formData.get('width_cm') || null,
    height_cm: formData.get('height_cm') || null,
    depth_cm: formData.get('depth_cm') || null,
    weight_kg: formData.get('weight_kg') || null,
    image_url: String(formData.get('image_url') ?? '').trim() || null,
    description: String(formData.get('description') ?? '').trim() || null,
    category_id: formData.get('category_id') || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { error } = await supabase.from('products').update(parsed.data).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
  return { success: true };
}

// 제품 목록 (물류용: 가격 제외)
export async function getProductsForSerials() {
  if (process.env.PREVIEW_MODE === 'true') {
    const { getPreviewSerialProducts } = await import('@/lib/previewData');
    return getPreviewSerialProducts();
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, barcode, base_stock, width_cm, height_cm, depth_cm, weight_kg, categories(id, name)')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

// 제품 상세 (물류용: 가격 제외)
export async function getProductForSerials(productId: string) {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, barcode, base_stock, width_cm, height_cm, depth_cm, weight_kg, categories(id, name)')
    .eq('id', productId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 시리얼 상태별 집계
export async function getSerialStatusCounts(productId: string) {
  if (process.env.PREVIEW_MODE === 'true') return {};
  const supabase = await createClient();
  const statuses = ['in_stock', 'reserved', 'shipped', 'sold', 'disposed'] as const;
  const counts: Record<string, number> = {};

  for (const status of statuses) {
    const { count } = await supabase
      .from('inventory_items')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('status', status);
    counts[status] = count ?? 0;
  }

  return counts;
}

// 개별 시리얼 바코드 목록 (페이지네이션 + 상태 필터 + 검색)
export async function getProductSerials(
  productId: string,
  options?: { status?: string; page?: number; pageSize?: number; search?: string },
) {
  if (process.env.PREVIEW_MODE === 'true') return { serials: [], total: 0, page: options?.page ?? 1, pageSize: options?.pageSize ?? 20 };
  const supabase = await createClient();
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('inventory_items')
    .select('*, product_lots(lot_number, manufactured_at), warehouses(id, name, code), warehouse_locations(id, name, code, full_path, type)', { count: 'exact' })
    .eq('product_id', productId);

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  if (options?.search?.trim()) {
    const term = options.search.trim();
    query = query.or(`unit_barcode.ilike.%${term}%,manufacturer_serial.ilike.%${term}%,product_lots.lot_number.ilike.%${term}%`);
  }

  const { data, error, count } = await query
    .order('serial_number', { ascending: true })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { serials: data, total: count ?? 0, page, pageSize };
}

// 시리얼 상태 변경
export async function updateSerialStatus(serialId: string, status: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };
  const { error } = await supabase
    .from('inventory_items')
    .update({ status })
    .eq('id', serialId);

  if (error) return { error: error.message };
  return { success: true };
}

// 시리얼 일괄 상태 변경
export async function updateSerialsStatusBatch(serialIds: string[], status: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };
  const { error } = await supabase
    .from('inventory_items')
    .update({ status })
    .in('id', serialIds);

  if (error) return { error: error.message };
  return { success: true };
}

// ── 개별 바코드(unit_barcode) 일괄 부여 ──

export async function assignUnitBarcodes(
  serialIds: string[],
  parentBarcode: string,
) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  if (serialIds.length === 0) return { error: '선택된 시리얼이 없습니다' };

  // 부모 바코드가 비어있으면 유니크값 생성
  const baseCode = parentBarcode.trim() || `UB${Date.now()}`;

  // 해당 baseCode- 패턴으로 이미 부여된 최대 번호 조회
  const prefix = `${baseCode}-`;
  const { data: existingBarcodes } = await supabase
    .from('inventory_items')
    .select('unit_barcode')
    .like('unit_barcode', `${prefix}%`);

  let startNum = 1;
  if (existingBarcodes && existingBarcodes.length > 0) {
    const maxNum = existingBarcodes.reduce((max, row) => {
      const suffix = row.unit_barcode?.replace(prefix, '') ?? '';
      const num = parseInt(suffix, 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    startNum = maxNum + 1;
  }

  // 클라이언트에서 전달된 순서(serial_number 오름차순) 유지하여 바코드 생성
  const barcodes = serialIds.map((id, i) => ({
    id,
    unitBarcode: `${prefix}${String(startNum + i).padStart(4, '0')}`,
  }));

  // 중복 체크 (자기 자신 제외)
  const newBarcodeValues = barcodes.map((b) => b.unitBarcode);
  const { data: dupCheck } = await supabase
    .from('inventory_items')
    .select('id, unit_barcode')
    .in('unit_barcode', newBarcodeValues);

  const conflicts = dupCheck?.filter((d) => !serialIds.includes(d.id)) ?? [];
  if (conflicts.length > 0) {
    return { error: `이미 존재하는 바코드: ${conflicts.map((d) => d.unit_barcode).join(', ')}` };
  }

  // 개별 업데이트
  let updated = 0;
  for (const b of barcodes) {
    const { error: updateErr } = await supabase
      .from('inventory_items')
      .update({ unit_barcode: b.unitBarcode })
      .eq('id', b.id);

    if (updateErr) return { error: `바코드 부여 실패: ${updateErr.message}` };
    updated++;
  }

  return { success: true, updated };
}

// ── 개별 바코드 직접 수정 (단건) ──

export async function updateUnitBarcode(serialId: string, newBarcode: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const value = newBarcode.trim() || null;

  if (value) {
    // 중복 체크 (자기 자신 제외)
    const { data: existing } = await supabase
      .from('inventory_items')
      .select('id')
      .eq('unit_barcode', value)
      .neq('id', serialId)
      .limit(1);

    if (existing && existing.length > 0) {
      return { error: `이미 존재하는 바코드: ${value}` };
    }
  }

  const { error } = await supabase
    .from('inventory_items')
    .update({ unit_barcode: value })
    .eq('id', serialId);

  if (error) return { error: error.message };
  return { success: true };
}

// ── 제조사 시리얼 단건 수정 ──

export async function updateManufacturerSerial(serialId: string, newSerial: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };
  const value = newSerial.trim() || null;

  const { error } = await supabase
    .from('inventory_items')
    .update({ manufacturer_serial: value })
    .eq('id', serialId);

  if (error) return { error: error.message };
  return { success: true };
}

// ── 제조사 시리얼 다중 부여 (줄바꿈 구분) ──

export async function assignManufacturerSerialsBatch(
  serialIds: string[],
  serialTexts: string[],
) {
  const supabase = await createClient();

  if (serialIds.length === 0) return { error: '선택된 시리얼이 없습니다' };
  if (serialIds.length !== serialTexts.length) {
    return { error: `선택 수(${serialIds.length})와 입력 수(${serialTexts.length})가 일치하지 않습니다` };
  }

  // 중복 체크 (비어있지 않은 값만, 자기 자신 제외)
  const nonEmpty = serialTexts.map((t) => t.trim()).filter(Boolean);
  if (nonEmpty.length > 0) {
    const { data: existing } = await supabase
      .from('inventory_items')
      .select('id, manufacturer_serial')
      .in('manufacturer_serial', nonEmpty);

    const conflicts = existing?.filter((e) => !serialIds.includes(e.id)) ?? [];
    if (conflicts.length > 0) {
      return { error: `이미 존재하는 시리얼: ${conflicts.map((d) => d.manufacturer_serial).join(', ')}` };
    }
  }

  let updated = 0;
  for (let i = 0; i < serialIds.length; i++) {
    const value = serialTexts[i].trim() || null;
    const { error } = await supabase
      .from('inventory_items')
      .update({ manufacturer_serial: value })
      .eq('id', serialIds[i]);

    if (error) return { error: `시리얼 부여 실패: ${error.message}` };
    updated++;
  }

  return { success: true, updated };
}

// ── 전체 출고 재고 목록 (보증 추적 페이지용) ──

export async function getAllShippedItems(options?: {
  search?: string;
  page?: number;
  pageSize?: number;
  productId?: string;
  companyId?: string;
}) {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_SHIPPED_ITEMS } = await import('@/lib/previewData');
    let filtered = [...PREVIEW_SHIPPED_ITEMS];
    if (options?.productId) {
      filtered = filtered.filter((item) => item.product_id === options.productId);
    }
    if (options?.companyId) {
      filtered = filtered.filter((item) => item.shipments.orders.companies.id === options.companyId);
    }
    const term = options?.search?.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((item) =>
        item.products.name.toLowerCase().includes(term) ||
        (item.inventory_items?.unit_barcode ?? '').toLowerCase().includes(term) ||
        (item.inventory_items?.manufacturer_serial ?? '').toLowerCase().includes(term) ||
        item.shipments.orders.companies.name.toLowerCase().includes(term)
      );
    }
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
    return { items: paged as unknown as typeof PREVIEW_SHIPPED_ITEMS, total: filtered.length };
  }
  const supabase = await createClient();

  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('shipment_serials')
    .select(`
      id,
      inventory_item_id,
      product_id,
      quantity,
      created_at,
      inventory_items(serial_number, unit_barcode, manufacturer_serial, status),
      shipments(
        id, shipped_at, completed_at,
        orders(
          id, order_number,
          companies(id, name, contact_name)
        )
      ),
      products(id, name, barcode)
    `, { count: 'exact' });

  if (options?.productId) {
    query = query.eq('product_id', options.productId);
  }

  if (options?.companyId) {
    // 해당 거래처의 order_id 목록을 먼저 조회 후 shipment_id로 필터
    const { data: orderIds } = await supabase
      .from('orders')
      .select('id')
      .eq('company_id', options.companyId);
    const ids = (orderIds ?? []).map((o) => o.id);
    if (ids.length === 0) return { items: [], total: 0 };
    const { data: shipmentIds } = await supabase
      .from('shipments')
      .select('id')
      .in('order_id', ids);
    const sids = (shipmentIds ?? []).map((s) => s.id);
    if (sids.length === 0) return { items: [], total: 0 };
    query = query.in('shipment_id', sids);
  }

  if (options?.search?.trim()) {
    const term = options.search.trim();
    query = query.or(
      `inventory_items.unit_barcode.ilike.%${term}%,inventory_items.manufacturer_serial.ilike.%${term}%,products.name.ilike.%${term}%`
    );
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { items: data ?? [], total: count ?? 0 };
}

// ── 출고현황 필터 옵션 (납품업체 + 제품 목록) ──

export async function getShippedFilterOptions() {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_SHIPPED_ITEMS } = await import('@/lib/previewData');
    const companiesMap = new Map<string, { id: string; name: string }>();
    const productsMap = new Map<string, { id: string; name: string; barcode: string }>();
    for (const item of PREVIEW_SHIPPED_ITEMS) {
      const co = item.shipments.orders.companies;
      companiesMap.set(co.id, { id: co.id, name: co.name });
      const pr = item.products;
      productsMap.set(pr.id, { id: pr.id, name: pr.name, barcode: pr.barcode });
    }
    return {
      companies: [...companiesMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      products: [...productsMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  const supabase = await createClient();

  const { data: ssData } = await supabase
    .from('shipment_serials')
    .select('product_id, shipments(orders(company_id, companies(id, name))), products(id, name, barcode)')
    .limit(2000);

  const companiesMap = new Map<string, { id: string; name: string }>();
  const productsMap = new Map<string, { id: string; name: string; barcode: string }>();

  for (const ss of ssData ?? []) {
    const co = (ss.shipments as unknown as { orders: { companies: { id: string; name: string } | null } | null } | null)?.orders?.companies;
    if (co?.id) companiesMap.set(co.id, { id: co.id, name: co.name });
    const pr = ss.products as unknown as { id: string; name: string; barcode: string } | null;
    if (pr?.id) productsMap.set(pr.id, { id: pr.id, name: pr.name, barcode: pr.barcode });
  }

  return {
    companies: [...companiesMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    products: [...productsMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── 출고 상세 (보증 현황 모달용) ──

export async function getShippedItemDetail(id: string) {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_SHIPPED_ITEMS } = await import('@/lib/previewData');
    const found = PREVIEW_SHIPPED_ITEMS.find((item) => item.id === id);
    if (!found) return null;
    return {
      ...found,
      shipments: {
        ...found.shipments,
        orders: {
          ...found.shipments.orders,
          status: 'completed',
          confirmed_at: found.shipments.shipped_at,
          confirmed_by: '김영업',
          notes: null,
          companies: {
            ...found.shipments.orders.companies,
            contact_phone: '010-1234-5678',
            contact_email: 'contact@example.com',
            contact_position: '구매팀장',
          },
          quotations: [
            {
              id: 'prev-quot-001',
              number: `Q-2026-${found.shipments.orders.id.slice(-3)}`,
              status: 'confirmed',
              issued_at: found.shipments.shipped_at,
              issued_by: '이견적',
            },
          ],
        },
      },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shipment_serials')
    .select(`
      id,
      inventory_item_id,
      product_id,
      quantity,
      created_at,
      inventory_items(serial_number, unit_barcode, manufacturer_serial, status),
      shipments(
        id, shipped_at, packed_at, completed_at,
        orders(
          id, order_number, status, confirmed_at, confirmed_by, notes,
          companies(id, name, contact_name, contact_phone, contact_email, contact_position),
          quotations(id, number, status, issued_at, issued_by)
        )
      ),
      products(id, name, barcode)
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── 출고된 아이템 목록 (보증 관리용) ──

export async function getShippedItemsByProduct(productId: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('shipment_serials')
    .select(`
      id,
      inventory_item_id,
      quantity,
      created_at,
      inventory_items(serial_number, unit_barcode, manufacturer_serial, status),
      shipments(
        id, shipped_at, completed_at,
        orders(
          id, order_number,
          companies(id, name, contact_name)
        )
      )
    `)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/products');
  return { success: true };
}
