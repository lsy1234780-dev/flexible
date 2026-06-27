'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ScanSchema = z.object({
  barcode: z.string().min(1, '바코드를 입력하세요'),
  quantity: z.coerce.number().min(1, '수량은 1 이상이어야 합니다').default(1),
  type: z.enum(['in', 'out']).default('in'),
  memo: z.string().optional().default(''),
  warehouse_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  location_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  sale_price: z.coerce.number().min(0).nullable().optional().default(null),
});

export async function getInventory() {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_PRODUCTS, PREVIEW_SHIPPED_ITEMS } = await import('@/lib/previewData');
    const shippedCounts: Record<string, number> = {};
    for (const item of PREVIEW_SHIPPED_ITEMS) {
      shippedCounts[item.product_id] = (shippedCounts[item.product_id] ?? 0) + 1;
    }
    const mockStock: Record<string, number> = {
      'prev-prod-0000-0000-000000000001': 15,
      'prev-prod-0000-0000-000000000002': 8,
      'prev-prod-0000-0000-000000000003': 5,
      'prev-prod-0000-0000-000000000004': 12,
      'prev-prod-0000-0000-000000000005': 7,
      'prev-prod-0000-0000-000000000006': 3,
      'prev-prod-0000-0000-000000000007': 5,
      'prev-prod-0000-0000-000000000008': 320,
      'prev-prod-0000-0000-000000000009': 180,
      'prev-prod-0000-0000-000000000010': 18,
    };
    return PREVIEW_PRODUCTS.map((p) => ({
      ...p,
      real_stock: mockStock[p.id] ?? 0,
      pending_stock: 0,
      confirmed_stock: 0,
      shipping_stock: 0,
      shipped_count: shippedCounts[p.id] ?? 0,
    }));
  }
  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, barcode, base_price, base_stock, category_id, categories(name)')
    .order('name');

  if (error) throw new Error(error.message);

  // 발주중(pending만) — confirmed 이후는 이미 base_stock에서 차감됨
  const { data: pendingOrders } = await supabase
    .from('orders')
    .select('order_items(product_id, quantity)')
    .eq('status', 'pending');

  const pendingMap = new Map<string, number>();
  if (pendingOrders) {
    for (const order of pendingOrders) {
      const items = order.order_items as Array<{ product_id: string; quantity: number }>;
      for (const item of items) {
        pendingMap.set(item.product_id, (pendingMap.get(item.product_id) ?? 0) + item.quantity);
      }
    }
  }

  // 출고중(shipped) 수량 집계 — 이미 차감됐지만 아직 배송 중인 수량 표시용
  const { data: shippedOrders } = await supabase
    .from('orders')
    .select('order_items(product_id, quantity)')
    .eq('status', 'shipped');

  const shippingMap = new Map<string, number>();
  if (shippedOrders) {
    for (const order of shippedOrders) {
      const items = order.order_items as Array<{ product_id: string; quantity: number }>;
      for (const item of items) {
        shippingMap.set(item.product_id, (shippingMap.get(item.product_id) ?? 0) + item.quantity);
      }
    }
  }

  // 확정됨(confirmed) — 차감됐지만 아직 출고 안 된 수량 표시용
  const { data: confirmedOrders } = await supabase
    .from('orders')
    .select('order_items(product_id, quantity)')
    .eq('status', 'confirmed');

  const confirmedMap = new Map<string, number>();
  if (confirmedOrders) {
    for (const order of confirmedOrders) {
      const items = order.order_items as Array<{ product_id: string; quantity: number }>;
      for (const item of items) {
        confirmedMap.set(item.product_id, (confirmedMap.get(item.product_id) ?? 0) + item.quantity);
      }
    }
  }

  // 실재고 (inventory_items status='in_stock' 집계)
  const { data: stockCounts } = await supabase
    .from('inventory_items')
    .select('product_id, id')
    .eq('status', 'in_stock');

  const realStockMap = new Map<string, number>();
  if (stockCounts) {
    for (const row of stockCounts) {
      realStockMap.set(row.product_id, (realStockMap.get(row.product_id) ?? 0) + 1);
    }
  }

  // 출고 완료 (inventory_items status='shipped' 또는 'sold' — 출고현황과 연결)
  const { data: shippedItems } = await supabase
    .from('inventory_items')
    .select('product_id')
    .in('status', ['shipped', 'sold']);

  const shippedMap = new Map<string, number>();
  if (shippedItems) {
    for (const row of shippedItems) {
      shippedMap.set(row.product_id, (shippedMap.get(row.product_id) ?? 0) + 1);
    }
  }

  return products.map((p) => ({
    ...p,
    real_stock: realStockMap.get(p.id) ?? 0,
    pending_stock: pendingMap.get(p.id) ?? 0,
    confirmed_stock: confirmedMap.get(p.id) ?? 0,
    shipping_stock: shippingMap.get(p.id) ?? 0,
    shipped_count: shippedMap.get(p.id) ?? 0,
  }));
}

export async function getActiveCompanies() {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_COMPANIES } = await import('@/lib/previewData');
    return PREVIEW_COMPANIES.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name }));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from('companies')
    .select('id, name')
    .eq('status', 'active')
    .order('name');
  return data ?? [];
}

export async function directShipProduct(input: {
  productId: string;
  quantity: number;
  companyId: string;
  handlerName: string;
  memo?: string;
  sale_price?: number | null;
}) {
  if (process.env.PREVIEW_MODE === 'true') {
    return { error: '미리보기 모드에서는 출고처리를 사용할 수 없습니다' };
  }

  const supabase = await createAdminClient();
  const workspaceId = await getCurrentWorkspaceId();

  // 가용 재고 확인
  const { data: availableItems } = await supabase
    .from('inventory_items')
    .select('id')
    .eq('product_id', input.productId)
    .eq('status', 'in_stock')
    .limit(input.quantity);

  if (!availableItems || availableItems.length < input.quantity) {
    return { error: `재고 부족 (가용: ${availableItems?.length ?? 0}개, 요청: ${input.quantity}개)` };
  }

  // 수주번호 채번
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .like('order_number', `ORD-${dateStr}-%`);
  const orderNumber = `ORD-${dateStr}-${String((count ?? 0) + 1).padStart(3, '0')}`;

  // 단가 조회
  const { data: product } = await supabase
    .from('products')
    .select('base_price, base_stock')
    .eq('id', input.productId)
    .single();

  // 수주 생성
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({
      company_id: input.companyId,
      order_number: orderNumber,
      status: 'completed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: input.handlerName,
      notes: input.memo || null,
      workspace_id: workspaceId,
    })
    .select('id')
    .single();
  if (oErr || !order) return { error: oErr?.message ?? '수주 생성 실패' };

  // 수주 항목
  const unitPrice = input.sale_price != null ? input.sale_price : (product?.base_price ?? 0);
  const { error: oiErr } = await supabase.from('order_items').insert({
    order_id: order.id,
    product_id: input.productId,
    quantity: input.quantity,
    unit_price: unitPrice,
    workspace_id: workspaceId,
  });
  if (oiErr) return { error: oiErr.message };

  // 출고 생성
  const { data: shipment, error: sErr } = await supabase
    .from('shipments')
    .insert({
      order_id: order.id,
      status: 'completed',
      shipped_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      workspace_id: workspaceId,
    })
    .select('id')
    .single();
  if (sErr || !shipment) return { error: sErr?.message ?? '출고 생성 실패' };

  const selectedIds = availableItems.slice(0, input.quantity).map((i) => i.id);

  // shipment_serials 생성
  await supabase.from('shipment_serials').insert(
    selectedIds.map((itemId) => ({
      shipment_id: shipment.id,
      inventory_item_id: itemId,
      product_id: input.productId,
      quantity: 1,
      workspace_id: workspaceId,
    })),
  );

  // inventory_items → shipped
  await supabase.from('inventory_items').update({ status: 'shipped' }).in('id', selectedIds);

  // inventory_movements 기록 (손익 추적)
  await supabase.from('inventory_movements').insert(
    selectedIds.map((id) => ({
      inventory_item_id: id,
      product_id: input.productId,
      from_status: 'in_stock',
      to_status: 'shipped',
      quantity: 1,
      reason: '직접 출고',
      memo: input.memo || null,
      sale_price: input.sale_price ?? null,
      workspace_id: workspaceId,
    })),
  );

  // products.base_stock 감소
  if (product) {
    await supabase
      .from('products')
      .update({ base_stock: product.base_stock - input.quantity })
      .eq('id', input.productId);
  }

  revalidatePath('/inventory');
  revalidatePath('/warranty');
  revalidatePath('/orders');
  return { success: true, orderNumber };
}

export async function processBarcodeScan(formData: FormData) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  const parsed = ScanSchema.safeParse({
    barcode: formData.get('barcode'),
    quantity: formData.get('quantity'),
    type: formData.get('type') ?? 'in',
    memo: formData.get('memo') ?? '',
    sale_price: formData.get('sale_price') || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { barcode, quantity, type, memo, warehouse_id, location_id, sale_price } = parsed.data;

  // 바코드로 제품 조회
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, name, base_stock')
    .eq('barcode', barcode)
    .single();

  if (productError || !product) {
    return { error: `바코드 [${barcode}]에 해당하는 제품을 찾을 수 없습니다` };
  }

  if (type === 'in') {
    // ── 입고: inventory_items 로우 생성 ──
    const { data: items, error: rpcError } = await supabase.rpc(
      'generate_inventory_items',
      {
        p_product_id: product.id,
        p_quantity: quantity,
        p_receiving_item_id: null,
        p_lot_id: null,
        p_generate_unit_barcode: false,
        p_warehouse_id: warehouse_id,
        p_location_id: location_id,
      },
    );

    if (rpcError) return { error: `재고 생성 실패: ${rpcError.message}` };

    // inventory_movements 기록
    const createdItems = items as { item_id: string }[];
    if (createdItems.length > 0) {
      await supabase.from('inventory_movements').insert(
        createdItems.map((item) => ({
          inventory_item_id: item.item_id,
          product_id: product.id,
          from_status: null,
          to_status: 'in_stock',
          quantity: 1,
          reason: '바코드 입고',
          memo: memo || null,
          workspace_id: workspaceId,
        })),
      );
    }
  } else {
    // ── 출고: 가용 inventory_items를 FIFO로 disposed 처리 ──
    const { data: stockItems } = await supabase
      .from('inventory_items')
      .select('id')
      .eq('product_id', product.id)
      .eq('status', 'in_stock')
      .order('created_at', { ascending: true })
      .limit(quantity);

    if (!stockItems || stockItems.length < quantity) {
      return {
        error: `가용 재고 부족 (실재고: ${stockItems?.length ?? 0}개, 요청: ${quantity}개)`,
      };
    }

    const itemIds = stockItems.map((i) => i.id);

    const { error: updateErr } = await supabase
      .from('inventory_items')
      .update({ status: 'disposed' })
      .in('id', itemIds);

    if (updateErr) return { error: `출고 처리 실패: ${updateErr.message}` };

    // inventory_movements 기록
    await supabase.from('inventory_movements').insert(
      itemIds.map((id) => ({
        inventory_item_id: id,
        product_id: product.id,
        from_status: 'in_stock',
        to_status: 'disposed',
        quantity: 1,
        reason: '바코드 출고',
        memo: memo || null,
        sale_price: sale_price ?? null,
        workspace_id: workspaceId,
      })),
    );
  }

  // 재고 이력 추가 (inventory_logs 유지 — 집계 이력용)
  await supabase.from('inventory_logs').insert({
    product_id: product.id,
    quantity,
    type,
    memo: memo || null,
    workspace_id: workspaceId,
    ...(type === 'out' && sale_price != null ? { sale_price } : {}),
  });

  // base_stock 캐시 업데이트
  const newStock = type === 'in' ? product.base_stock + quantity : product.base_stock - quantity;
  await supabase
    .from('products')
    .update({ base_stock: newStock })
    .eq('id', product.id);

  revalidatePath('/inventory');
  revalidatePath('/products');

  return {
    success: true,
    product: { name: product.name, newStock },
    message: `${product.name} — ${type === 'in' ? '입고' : '출고'} ${quantity}개 완료 (현재고: ${newStock}개)`,
  };
}

export async function getRecentLogs(limit = 20) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_logs')
    .select('*, products(name, barcode)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

export async function getProfitLossReport(options?: {
  from?: string;
  to?: string;
  productId?: string;
}) {
  if (process.env.PREVIEW_MODE === 'true') return { rows: [], summary: { revenue: 0, cost: 0, profit: 0, count: 0 } };
  const supabase = await createClient();

  let query = supabase
    .from('inventory_pl_view')
    .select('*')
    .order('created_at', { ascending: false });

  if (options?.from) query = query.gte('created_at', options.from);
  if (options?.to) query = query.lte('created_at', options.to);
  if (options?.productId) query = query.eq('product_id', options.productId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const summary = rows.reduce(
    (acc, row) => {
      const qty = row.quantity ?? 1;
      acc.revenue += (row.sale_price ?? 0) * qty;
      acc.cost += (row.cost_price ?? 0) * qty;
      acc.profit += row.profit ?? 0;
      acc.count += qty;
      return acc;
    },
    { revenue: 0, cost: 0, profit: 0, count: 0 },
  );

  return { rows, summary };
}
