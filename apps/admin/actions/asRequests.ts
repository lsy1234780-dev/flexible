'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { AS_STATUS_LABEL } from '@/lib/asConstants';
import type { AsStatus } from '@/lib/asConstants';

// ── 미리보기 모드 인메모리 상태 저장소 ──
// 실제 DB 없이도 상태 전환 흐름을 확인할 수 있도록 개발 서버 메모리에 임시 저장
const previewStore = new Map<string, {
  status?: AsStatus;
  inspection_content?: string | null;
  defective_parts?: string[];
  repair_content?: string | null;
  assigned_to?: string | null;
  repair_cost?: number | null;
  estimated_completion_at?: string | null;
  memo?: string | null;
  completed_at?: string | null;
}>();

// ── 목록 조회 ──

export async function getAsRequests() {
  if (process.env.PREVIEW_MODE === 'true') {
    return getMockAsRequests().map((r) => {
      const override = previewStore.get(r.id);
      return override ? { ...r, ...override } : r;
    });
  }
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('as_requests')
    .select(`
      id, number, status, customer_name, customer_phone,
      product_name, serial_number, symptom, defective_parts,
      assigned_to, estimated_completion_at, completed_at,
      repair_cost, memo, created_at, updated_at,
      companies(id, name),
      products(id, name, barcode)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return data;
}

// ── 상세 조회 ──

export async function getAsRequest(id: string) {
  if (process.env.PREVIEW_MODE === 'true') {
    const mock = getMockAsRequests();
    const found = mock.find((r) => r.id === id) ?? null;
    if (!found) return null;
    // 인메모리 저장소의 변경사항 적용
    const override = previewStore.get(id);
    if (!override) return found;
    return {
      ...found,
      ...override,
      // completed_at 처리
      completed_at: override.status === 'completed' ? new Date().toISOString() : found.completed_at,
      as_logs: found.as_logs,
    };
  }
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('as_requests')
    .select(`
      id, number, status, customer_name, customer_phone,
      product_name, serial_number, symptom, defective_parts,
      inspection_content, repair_content, assigned_to, estimated_completion_at,
      completed_at, repair_cost, memo, created_at, updated_at,
      companies(id, name),
      products(id, name, barcode),
      as_logs(id, status, content, created_by_name, created_at)
    `)
    .eq('id', id)
    .order('created_at', { ascending: true, referencedTable: 'as_logs' })
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── 생성 ──

export async function createAsRequest(formData: FormData) {
  if (process.env.PREVIEW_MODE === 'true') return { error: '미리보기 모드에서는 생성할 수 없습니다' };
  const supabase = await createAdminClient();

  // 채번: AS-YYYY-NNN
  const year = new Date().getFullYear();
  const prefix = `AS-${year}-`;
  const { count } = await supabase
    .from('as_requests')
    .select('*', { count: 'exact', head: true })
    .like('number', `${prefix}%`);
  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const number = `${prefix}${seq}`;

  const parts = formData.getAll('defective_parts') as string[];

  const { data, error } = await supabase
    .from('as_requests')
    .insert({
      number,
      company_id: formData.get('company_id') || null,
      customer_name: formData.get('customer_name') || null,
      customer_phone: formData.get('customer_phone') || null,
      product_name: formData.get('product_name') as string,
      product_id: formData.get('product_id') || null,
      serial_number: formData.get('serial_number') || null,
      symptom: formData.get('symptom') as string,
      defective_parts: parts,
      assigned_to: formData.get('assigned_to') || null,
      estimated_completion_at: formData.get('estimated_completion_at') || null,
      repair_cost: formData.get('repair_cost') ? Number(formData.get('repair_cost')) : null,
      memo: formData.get('memo') || null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  // 접수 이력 기록
  await supabase.from('as_logs').insert({
    as_request_id: data.id,
    status: 'received',
    content: '접수',
    created_by_name: formData.get('created_by_name') as string || '관리자',
  });

  revalidatePath('/as');
  return { id: data.id };
}

// ── 상태 변경 ──

export async function updateAsStatus(
  id: string,
  status: AsStatus,
  content?: string,
  createdByName?: string,
) {
  if (process.env.PREVIEW_MODE === 'true') {
    const curr = previewStore.get(id) ?? {};
    previewStore.set(id, { ...curr, status });
    revalidatePath('/as');
    revalidatePath(`/as/${id}`);
    return {};
  }
  const supabase = await createAdminClient();

  const updates: Record<string, unknown> = { status };
  if (status === 'completed') updates.completed_at = new Date().toISOString();

  const { error } = await supabase
    .from('as_requests')
    .update(updates)
    .eq('id', id);

  if (error) return { error: error.message };

  await supabase.from('as_logs').insert({
    as_request_id: id,
    status,
    content: content || AS_STATUS_LABEL[status],
    created_by_name: createdByName || '관리자',
  });

  revalidatePath('/as');
  revalidatePath(`/as/${id}`);
  return {};
}

// ── 수정 (수리내용, 담당자, 비용 등) ──

export async function updateAsRequest(
  id: string,
  fields: {
    repair_content?: string;
    inspection_content?: string | null;
    assigned_to?: string;
    estimated_completion_at?: string;
    repair_cost?: number | null;
    memo?: string;
    defective_parts?: string[];
    customer_name?: string;
    customer_phone?: string;
    serial_number?: string;
  },
) {
  if (process.env.PREVIEW_MODE === 'true') {
    const curr = previewStore.get(id) ?? {};
    previewStore.set(id, { ...curr, ...fields });
    revalidatePath('/as');
    revalidatePath(`/as/${id}`);
    return {};
  }
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('as_requests')
    .update(fields)
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/as');
  revalidatePath(`/as/${id}`);
  return {};
}

// ── 검수 완료 (inspection_content + defective_parts 저장 + 수리중 전환) ──

export async function completeInspection(
  id: string,
  inspectionContent: string,
  defectiveParts: string[],
  inspectorName?: string,
) {
  if (process.env.PREVIEW_MODE === 'true') {
    const curr = previewStore.get(id) ?? {};
    previewStore.set(id, {
      ...curr,
      status: 'repairing',
      inspection_content: inspectionContent,
      defective_parts: defectiveParts,
      assigned_to: inspectorName || curr.assigned_to,
    });
    revalidatePath('/as');
    revalidatePath(`/as/${id}`);
    return {};
  }
  const supabase = await createAdminClient();

  const updateData: Record<string, unknown> = {
    inspection_content: inspectionContent,
    defective_parts: defectiveParts,
    status: 'repairing',
  };
  if (inspectorName) updateData.assigned_to = inspectorName;

  const { error } = await supabase
    .from('as_requests')
    .update(updateData)
    .eq('id', id);

  if (error) return { error: error.message };

  await supabase.from('as_logs').insert({
    as_request_id: id,
    status: 'repairing',
    content: `검수 완료 → 수리 시작. 고장 부위: ${defectiveParts.length > 0 ? defectiveParts.join(', ') : '미선택'}`,
    created_by_name: inspectorName || '검수자',
  });

  revalidatePath('/as');
  revalidatePath(`/as/${id}`);
  return {};
}

// ── 삭제 ──

export async function deleteAsRequest(id: string) {
  if (process.env.PREVIEW_MODE === 'true') return { error: '미리보기 모드에서는 삭제할 수 없습니다' };
  const supabase = await createAdminClient();
  const { error } = await supabase.from('as_requests').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/as');
  return {};
}

// ── 업체 목록 (접수 폼용) ──

export async function getCompaniesForAs() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('companies')
    .select('id, name')
    .eq('status', 'active')
    .order('name');
  return data ?? [];
}

// ── 제품 목록 (접수 폼용) ──

export async function getProductsForAs() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('products')
    .select('id, name, barcode')
    .order('name');
  return data ?? [];
}

// ── 미리보기용 목 데이터 ──

function getMockAsRequests() {
  return [
    {
      id: 'mock-1',
      number: 'AS-2026-001',
      status: 'repairing' as AsStatus,
      customer_name: '김철수',
      customer_phone: '010-1234-5678',
      product_name: '무선 바코드 스캐너 BT-100',
      serial_number: 'SN-BT100-001',
      symptom: '전원이 켜지지 않고 충전도 되지 않음',
      defective_parts: ['전원 불량', '충전 불량'],
      inspection_content: '충전 포트 핀 부식 및 단선 확인. 배터리 잔량 0% 상태.',
      repair_content: '충전 포트 교체 진행 중',
      assigned_to: '이수리',
      estimated_completion_at: '2026-03-15',
      completed_at: null,
      repair_cost: 35000,
      memo: '부품 주문 완료',
      created_at: '2026-03-10T09:00:00Z',
      updated_at: '2026-03-11T10:00:00Z',
      companies: { id: 'c1', name: 'AA유통' },
      products: null,
      as_logs: [],
    },
    {
      id: 'mock-2',
      number: 'AS-2026-002',
      status: 'received' as AsStatus,
      customer_name: '박영희',
      customer_phone: '010-9876-5432',
      product_name: '산업용 PDA 단말기 P-600',
      serial_number: 'SN-P600-001',
      symptom: '스캔 후 데이터가 PC로 전달되지 않음',
      defective_parts: [],
      inspection_content: null,
      repair_content: null,
      assigned_to: null,
      estimated_completion_at: null,
      completed_at: null,
      repair_cost: null,
      memo: null,
      created_at: '2026-03-11T08:30:00Z',
      updated_at: '2026-03-11T08:30:00Z',
      companies: { id: 'c2', name: '한국물류(주)' },
      products: null,
      as_logs: [],
    },
    {
      id: 'mock-3',
      number: 'AS-2026-003',
      status: 'completed' as AsStatus,
      customer_name: null,
      customer_phone: null,
      product_name: '프린터 LP-50',
      serial_number: null,
      symptom: '라벨 프린트 시 줄무늬 발생',
      defective_parts: ['화면 불량', '기타'],
      inspection_content: '써멀 헤드 소손 확인. 헤드 교체 필요.',
      repair_content: '헤드 유닛 교체 완료. 테스트 인쇄 정상 확인.',
      assigned_to: '최기사',
      estimated_completion_at: '2026-03-10',
      completed_at: '2026-03-10T15:00:00Z',
      repair_cost: 58000,
      memo: null,
      created_at: '2026-03-08T14:00:00Z',
      updated_at: '2026-03-10T15:00:00Z',
      companies: null,
      products: null,
      as_logs: [],
    },
  ];
}

// ── 시리얼 배치 보증 조회 (AS 목록용) ──

export async function getWarrantyBatchBySerials(
  serials: string[],
): Promise<Record<string, string | null>> {
  const uniq = [...new Set(serials.filter(Boolean))];
  if (uniq.length === 0) return {};

  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_SHIPPED_ITEMS } = await import('@/lib/previewData');
    const result: Record<string, string | null> = {};
    for (const term of uniq) {
      const found = PREVIEW_SHIPPED_ITEMS.find(
        (item) =>
          item.inventory_items?.unit_barcode === term ||
          item.inventory_items?.manufacturer_serial === term,
      );
      result[term] = found?.shipments?.shipped_at ?? null;
    }
    return result;
  }

  const supabase = await createClient();
  const result: Record<string, string | null> = {};

  for (const term of uniq) {
    const { data: items } = await supabase
      .from('inventory_items')
      .select('id')
      .or(`unit_barcode.eq.${term},manufacturer_serial.eq.${term}`)
      .limit(1);
    const item = items?.[0];
    if (!item) { result[term] = null; continue; }

    const { data: ss } = await supabase
      .from('shipment_serials')
      .select('shipments(shipped_at, completed_at)')
      .eq('inventory_item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const shipment = ss?.[0]?.shipments as unknown as { shipped_at: string | null; completed_at: string | null } | null;
    result[term] = shipment?.shipped_at ?? shipment?.completed_at ?? null;
  }

  return result;
}

// ── 시리얼로 보증 정보 조회 ──

export async function getWarrantyBySerial(serialText: string) {
  if (!serialText?.trim()) return null;

  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_SHIPPED_ITEMS } = await import('@/lib/previewData');
    const term = serialText.trim();
    const found = PREVIEW_SHIPPED_ITEMS.find(
      (item) =>
        item.inventory_items?.unit_barcode === term ||
        item.inventory_items?.manufacturer_serial === term,
    );
    if (!found) return null;
    const shipment = found.shipments;
    const order = shipment?.orders ?? null;
    return {
      item: found.inventory_items,
      shippedAt: shipment?.shipped_at ?? null,
      orderNumber: order?.order_number ?? null,
      companyName: order?.companies?.name ?? null,
    };
  }

  const supabase = await createClient();
  const term = serialText.trim();

  // unit_barcode 또는 manufacturer_serial로 inventory_item 검색
  const { data: items } = await supabase
    .from('inventory_items')
    .select('id, serial_number, unit_barcode, manufacturer_serial, status')
    .or(`unit_barcode.eq.${term},manufacturer_serial.eq.${term}`)
    .limit(1);

  const item = items?.[0];
  if (!item) return null;

  // 해당 item의 shipment_serial 조회 → shipped_at
  const { data: ss } = await supabase
    .from('shipment_serials')
    .select(`
      id,
      shipments(shipped_at, completed_at, orders(order_number, companies(name)))
    `)
    .eq('inventory_item_id', item.id)
    .order('created_at', { ascending: false })
    .limit(1);

  const shipmentSerial = ss?.[0];
  const shipment = shipmentSerial?.shipments as unknown as {
    shipped_at: string | null;
    completed_at: string | null;
    orders: { order_number: string | null; companies: { name: string } | null } | null;
  } | null;

  const shippedAt = shipment?.shipped_at ?? shipment?.completed_at ?? null;

  return {
    item,
    shippedAt,
    orderNumber: shipment?.orders?.order_number ?? null,
    companyName: shipment?.orders?.companies?.name ?? null,
  };
}
