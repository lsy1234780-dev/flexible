// PREVIEW_MODE=true 일 때 사용할 샘플 데이터

export const PREVIEW_COMPANIES = [
  { id: 'prev-comp-0000-0000-000000000001', name: 'AA유통', is_supplier: false, is_customer: true, status: 'active' as const, created_at: '2025-01-01T00:00:00Z' },
  { id: 'prev-comp-0000-0000-000000000002', name: 'BB전자', is_supplier: false, is_customer: true, status: 'active' as const, created_at: '2025-01-02T00:00:00Z' },
  { id: 'prev-comp-0000-0000-000000000003', name: 'CC물류', is_supplier: false, is_customer: true, status: 'active' as const, created_at: '2025-01-03T00:00:00Z' },
  { id: 'prev-comp-0000-0000-000000000004', name: 'DD테크', is_supplier: false, is_customer: true, status: 'active' as const, created_at: '2025-01-04T00:00:00Z' },
  { id: 'prev-comp-0000-0000-000000000005', name: 'EE상사', is_supplier: false, is_customer: true, status: 'pending' as const, created_at: '2025-01-05T00:00:00Z' },
];

export const PREVIEW_PRODUCTS = [
  { id: 'prev-prod-0000-0000-000000000001', name: '무선 바코드 스캐너 BT-100', barcode: '8801234000001', base_price: 85000,  base_stock: 100, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
  { id: 'prev-prod-0000-0000-000000000002', name: '2D QR 스캐너 Q-200',         barcode: '8801234000002', base_price: 95000,  base_stock:  80, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
  { id: 'prev-prod-0000-0000-000000000003', name: '고정식 바코드 리더 F-300',   barcode: '8801234000003', base_price: 150000, base_stock:  50, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
  { id: 'prev-prod-0000-0000-000000000004', name: '라벨 프린터 LP-400',          barcode: '8801234000004', base_price: 210000, base_stock:  40, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
  { id: 'prev-prod-0000-0000-000000000005', name: '감열 라벨 프린터 TP-500',     barcode: '8801234000005', base_price: 185000, base_stock:  35, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
  { id: 'prev-prod-0000-0000-000000000006', name: '산업용 PDA 단말기 P-600',     barcode: '8801234000006', base_price: 320000, base_stock:  20, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
  { id: 'prev-prod-0000-0000-000000000007', name: '핸드헬드 터미널 HT-700',      barcode: '8801234000007', base_price: 280000, base_stock:  25, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
  { id: 'prev-prod-0000-0000-000000000008', name: '라벨 롤 (57x40, 1000매)',     barcode: '8801234000008', base_price: 12000,  base_stock: 500, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
  { id: 'prev-prod-0000-0000-000000000009', name: '라벨 롤 (100x70, 500매)',     barcode: '8801234000009', base_price: 18000,  base_stock: 300, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
  { id: 'prev-prod-0000-0000-000000000010', name: '스캐너 충전 크래들 CR-100',   barcode: '8801234000010', base_price: 35000,  base_stock:  60, is_visible_default: true, category_id: null, created_at: '2025-01-01T00:00:00Z', categories: null, width_cm: null, height_cm: null, depth_cm: null, weight_kg: null, image_url: null, description: null },
];

// 출고 재고 샘플 (보증 현황 미리보기용)
// 기준일: 2026-03-17
export const PREVIEW_SHIPPED_ITEMS = [
  {
    id: 'prev-ss-000000000001',
    inventory_item_id: 'prev-ii-000000000001',
    product_id: 'prev-prod-0000-0000-000000000001',
    quantity: 1,
    created_at: '2026-01-10T09:00:00Z',
    inventory_items: { serial_number: 1, unit_barcode: '8801234000001-0001', manufacturer_serial: 'SN-BT100-001', status: 'shipped' },
    shipments: { id: 'prev-ship-001', shipped_at: '2026-01-10T09:00:00Z', completed_at: null, orders: { id: 'prev-ord-001', order_number: 'ORD-2026-001', companies: { id: 'prev-comp-0000-0000-000000000001', name: 'AA유통', contact_name: '김OO' } } },
    products: { id: 'prev-prod-0000-0000-000000000001', name: '무선 바코드 스캐너 BT-100', barcode: '8801234000001' },
  },
  {
    id: 'prev-ss-000000000002',
    inventory_item_id: 'prev-ii-000000000002',
    product_id: 'prev-prod-0000-0000-000000000001',
    quantity: 1,
    created_at: '2026-02-20T11:00:00Z',
    inventory_items: { serial_number: 2, unit_barcode: '8801234000001-0002', manufacturer_serial: null, status: 'shipped' },
    shipments: { id: 'prev-ship-002', shipped_at: '2026-02-20T11:00:00Z', completed_at: null, orders: { id: 'prev-ord-002', order_number: 'ORD-2026-002', companies: { id: 'prev-comp-0000-0000-000000000002', name: 'BB전자', contact_name: '이OO' } } },
    products: { id: 'prev-prod-0000-0000-000000000001', name: '무선 바코드 스캐너 BT-100', barcode: '8801234000001' },
  },
  {
    id: 'prev-ss-000000000003',
    inventory_item_id: 'prev-ii-000000000003',
    product_id: 'prev-prod-0000-0000-000000000004',
    quantity: 1,
    created_at: '2025-09-05T10:00:00Z',
    inventory_items: { serial_number: 1, unit_barcode: '8801234000004-0001', manufacturer_serial: 'SN-LP400-001', status: 'shipped' },
    shipments: { id: 'prev-ship-003', shipped_at: '2025-09-05T10:00:00Z', completed_at: null, orders: { id: 'prev-ord-003', order_number: 'ORD-2025-018', companies: { id: 'prev-comp-0000-0000-000000000003', name: 'CC물류', contact_name: '박OO' } } },
    products: { id: 'prev-prod-0000-0000-000000000004', name: '라벨 프린터 LP-400', barcode: '8801234000004' },
  },
  {
    id: 'prev-ss-000000000004',
    inventory_item_id: 'prev-ii-000000000004',
    product_id: 'prev-prod-0000-0000-000000000006',
    quantity: 1,
    created_at: '2025-03-01T08:00:00Z',
    inventory_items: { serial_number: 1, unit_barcode: '8801234000006-0001', manufacturer_serial: 'SN-P600-001', status: 'sold' },
    shipments: { id: 'prev-ship-004', shipped_at: '2025-03-01T08:00:00Z', completed_at: null, orders: { id: 'prev-ord-004', order_number: 'ORD-2025-004', companies: { id: 'prev-comp-0000-0000-000000000001', name: 'AA유통', contact_name: '김OO' } } },
    products: { id: 'prev-prod-0000-0000-000000000006', name: '산업용 PDA 단말기 P-600', barcode: '8801234000006' },
  },
  {
    id: 'prev-ss-000000000005',
    inventory_item_id: 'prev-ii-000000000005',
    product_id: 'prev-prod-0000-0000-000000000006',
    quantity: 1,
    created_at: '2024-12-10T14:00:00Z',
    inventory_items: { serial_number: 2, unit_barcode: '8801234000006-0002', manufacturer_serial: 'SN-P600-002', status: 'sold' },
    shipments: { id: 'prev-ship-005', shipped_at: '2024-12-10T14:00:00Z', completed_at: null, orders: { id: 'prev-ord-005', order_number: 'ORD-2024-041', companies: { id: 'prev-comp-0000-0000-000000000004', name: 'DD테크', contact_name: '최OO' } } },
    products: { id: 'prev-prod-0000-0000-000000000006', name: '산업용 PDA 단말기 P-600', barcode: '8801234000006' },
  },
  {
    id: 'prev-ss-000000000006',
    inventory_item_id: 'prev-ii-000000000006',
    product_id: 'prev-prod-0000-0000-000000000002',
    quantity: 1,
    created_at: '2025-03-02T10:00:00Z',
    inventory_items: { serial_number: 1, unit_barcode: '8801234000002-0001', manufacturer_serial: null, status: 'sold' },
    shipments: { id: 'prev-ship-006', shipped_at: '2025-03-02T10:00:00Z', completed_at: null, orders: { id: 'prev-ord-006', order_number: 'ORD-2025-005', companies: { id: 'prev-comp-0000-0000-000000000002', name: 'BB전자', contact_name: '이OO' } } },
    products: { id: 'prev-prod-0000-0000-000000000002', name: '2D QR 스캐너 Q-200', barcode: '8801234000002' },
  },
  {
    id: 'prev-ss-000000000007',
    inventory_item_id: 'prev-ii-000000000007',
    product_id: 'prev-prod-0000-0000-000000000007',
    quantity: 1,
    created_at: '2026-03-01T09:00:00Z',
    inventory_items: { serial_number: 1, unit_barcode: '8801234000007-0001', manufacturer_serial: 'SN-HT700-001', status: 'shipped' },
    shipments: { id: 'prev-ship-007', shipped_at: '2026-03-01T09:00:00Z', completed_at: null, orders: { id: 'prev-ord-007', order_number: 'ORD-2026-005', companies: { id: 'prev-comp-0000-0000-000000000003', name: 'CC물류', contact_name: '박OO' } } },
    products: { id: 'prev-prod-0000-0000-000000000007', name: '핸드헬드 터미널 HT-700', barcode: '8801234000007' },
  },
  {
    id: 'prev-ss-000000000008',
    inventory_item_id: 'prev-ii-000000000008',
    product_id: 'prev-prod-0000-0000-000000000004',
    quantity: 1,
    created_at: '2025-04-10T13:00:00Z',
    inventory_items: { serial_number: 2, unit_barcode: '8801234000004-0002', manufacturer_serial: 'SN-LP400-002', status: 'sold' },
    shipments: { id: 'prev-ship-008', shipped_at: '2025-04-10T13:00:00Z', completed_at: null, orders: { id: 'prev-ord-008', order_number: 'ORD-2025-010', companies: { id: 'prev-comp-0000-0000-000000000001', name: 'AA유통', contact_name: '김OO' } } },
    products: { id: 'prev-prod-0000-0000-000000000004', name: '라벨 프린터 LP-400', barcode: '8801234000004' },
  },
];

// 업체별 커스텀 단가 (AA유통 기준)
const PRICE_OVERRIDES: Record<string, Record<string, number>> = {
  'prev-comp-0000-0000-000000000001': { // AA유통
    'prev-prod-0000-0000-000000000001': 78000,
    'prev-prod-0000-0000-000000000002': 88000,
    'prev-prod-0000-0000-000000000004': 195000,
    'prev-prod-0000-0000-000000000006': 300000,
  },
  'prev-comp-0000-0000-000000000003': { // CC물류
    'prev-prod-0000-0000-000000000001': 80000,
    'prev-prod-0000-0000-000000000003': 140000,
    'prev-prod-0000-0000-000000000006': 295000,
    'prev-prod-0000-0000-000000000007': 260000,
  },
};

export function getPreviewCompanyPrices(companyId: string): Record<string, number> {
  const overrides = PRICE_OVERRIDES[companyId] ?? {};
  const result: Record<string, number> = {};
  for (const p of PREVIEW_PRODUCTS) {
    result[p.id] = overrides[p.id] ?? p.base_price;
  }
  return result;
}

export const PREVIEW_CATEGORIES = [
  { id: 'prev-cat-0000-0000-000000000001', name: '스캐너', parent_id: null, sort_order: 0, created_at: '2025-01-01T00:00:00Z' },
  { id: 'prev-cat-0000-0000-000000000002', name: '프린터', parent_id: null, sort_order: 1, created_at: '2025-01-01T00:00:00Z' },
  { id: 'prev-cat-0000-0000-000000000003', name: '소모품', parent_id: null, sort_order: 2, created_at: '2025-01-01T00:00:00Z' },
];

export const PREVIEW_CATEGORY_PRODUCT_COUNTS: Record<string, number> = {
  'prev-cat-0000-0000-000000000001': 4,
  'prev-cat-0000-0000-000000000002': 2,
  'prev-cat-0000-0000-000000000003': 4,
};

export const PREVIEW_LOTS = [
  {
    id: 'prev-lot-0000-0000-000000000001', lot_number: 'LOT-260628', product_id: 'prev-prod-0000-0000-000000000005',
    manufactured_at: '2026-06-20', received_at: '2026-06-28', quantity: 210, memo: null, created_at: '2026-06-28T00:00:00Z',
    products: { name: '감열 라벨 프린터 TP-500', barcode: '8801234000005' },
  },
  {
    id: 'prev-lot-0000-0000-000000000002', lot_number: 'LOT-260620', product_id: 'prev-prod-0000-0000-000000000001',
    manufactured_at: '2026-06-12', received_at: '2026-06-20', quantity: 128, memo: null, created_at: '2026-06-20T00:00:00Z',
    products: { name: '무선 바코드 스캐너 BT-100', barcode: '8801234000001' },
  },
];

export const PREVIEW_QUOTATIONS = [
  {
    id: 'prev-quo-0000-0000-000000000001', company_id: 'prev-comp-0000-0000-000000000001', number: 'Q-2026-118',
    status: 'sent', order_id: null, issued_at: '2026-07-01T00:00:00Z', issued_by: 'sales@flexible.test', created_at: '2026-07-01T00:00:00Z',
    companies: { id: 'prev-comp-0000-0000-000000000001', name: 'AA유통' },
  },
  {
    id: 'prev-quo-0000-0000-000000000002', company_id: 'prev-comp-0000-0000-000000000004', number: 'Q-2026-117',
    status: 'draft', order_id: null, issued_at: '2026-06-28T00:00:00Z', issued_by: 'sales@flexible.test', created_at: '2026-06-28T00:00:00Z',
    companies: { id: 'prev-comp-0000-0000-000000000004', name: 'DD테크' },
  },
];

export const PREVIEW_DEAL_STAGES = [
  { id: 'prev-stage-0000-0000-000000000001', workspace_id: 'a0000000-0000-4000-8000-000000000001', name: '리드', sort_order: 0, kind: 'open' as const, color: '#94a3b8', created_at: '2025-01-01T00:00:00Z' },
  { id: 'prev-stage-0000-0000-000000000002', workspace_id: 'a0000000-0000-4000-8000-000000000001', name: '제안', sort_order: 1, kind: 'open' as const, color: '#3b82f6', created_at: '2025-01-01T00:00:00Z' },
  { id: 'prev-stage-0000-0000-000000000003', workspace_id: 'a0000000-0000-4000-8000-000000000001', name: '협상', sort_order: 2, kind: 'open' as const, color: '#f59e0b', created_at: '2025-01-01T00:00:00Z' },
  { id: 'prev-stage-0000-0000-000000000004', workspace_id: 'a0000000-0000-4000-8000-000000000001', name: '계약 완료', sort_order: 3, kind: 'won' as const, color: '#22c55e', created_at: '2025-01-01T00:00:00Z' },
];

export const PREVIEW_DEALS = [
  {
    id: 'prev-deal-0000-0000-000000000001', workspace_id: 'a0000000-0000-4000-8000-000000000001', title: '하반기 센서 공급',
    company_id: 'prev-comp-0000-0000-000000000001', stage_id: 'prev-stage-0000-0000-000000000003', owner_id: null,
    value: 22000000, currency: 'KRW', status: 'open', expected_close_date: '2026-08-15', source: null,
    quotation_id: null, order_id: null, notes: null, created_at: '2026-06-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    companies: { id: 'prev-comp-0000-0000-000000000001', name: 'AA유통' },
    deal_stages: { id: 'prev-stage-0000-0000-000000000003', name: '협상', kind: 'open', color: '#f59e0b' },
  },
  {
    id: 'prev-deal-0000-0000-000000000002', workspace_id: 'a0000000-0000-4000-8000-000000000001', title: '로봇팔 신규 도입',
    company_id: 'prev-comp-0000-0000-000000000004', stage_id: 'prev-stage-0000-0000-000000000002', owner_id: null,
    value: 58000000, currency: 'KRW', status: 'open', expected_close_date: '2026-09-01', source: null,
    quotation_id: null, order_id: null, notes: null, created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-30T00:00:00Z',
    companies: { id: 'prev-comp-0000-0000-000000000004', name: 'DD테크' },
    deal_stages: { id: 'prev-stage-0000-0000-000000000002', name: '제안', kind: 'open', color: '#3b82f6' },
  },
];

export const PREVIEW_DEAL_FORECAST = {
  byStage: [
    { stageId: 'prev-stage-0000-0000-000000000001', name: '리드', kind: 'open', total: 0, count: 0 },
    { stageId: 'prev-stage-0000-0000-000000000002', name: '제안', kind: 'open', total: 58000000, count: 1 },
    { stageId: 'prev-stage-0000-0000-000000000003', name: '협상', kind: 'open', total: 22000000, count: 1 },
    { stageId: 'prev-stage-0000-0000-000000000004', name: '계약 완료', kind: 'won', total: 0, count: 0 },
  ],
  openTotal: 80000000,
  wonTotal: 0,
  weightedForecast: 27200000,
};

export const PREVIEW_PURCHASE_ORDERS = [
  {
    id: 'prev-po-0000-0000-000000000001', po_number: 'PO-2026-021', title: '라벨 프린터 재입고', supplier_id: null,
    supplier: '한국포장자재', supplier_contact: '02-1234-5678', total_amount: 12400000, currency: 'KRW', exchange_rate: 1,
    vat_amount: 1240000, payment_status: 'unpaid', status: 'approved', memo: null, created_by: null,
    created_at: '2026-06-20T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
    companies: null, purchase_order_items: [], purchase_order_payments: [], inbound_shipments: [],
  },
  {
    id: 'prev-po-0000-0000-000000000002', po_number: 'PO-2026-020', title: '스캐너 부품 발주', supplier_id: null,
    supplier: '대한전자부품', supplier_contact: '02-2345-6789', total_amount: 6800000, currency: 'KRW', exchange_rate: 1,
    vat_amount: 680000, payment_status: 'paid', status: 'completed', memo: null, created_by: null,
    created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-15T00:00:00Z',
    companies: null, purchase_order_items: [], purchase_order_payments: [], inbound_shipments: [],
  },
];

export const PREVIEW_RECEIVING_ORDERS = [
  {
    id: 'prev-rco-0000-0000-000000000001', title: '스캐너 입고 (6월분)', status: 'pending', memo: null,
    created_at: '2026-06-30T00:00:00Z', completed_at: null, confirmed_at: null,
    receiving_items: [
      { id: 'prev-ri-0000-0000-000000000001', product_id: 'prev-prod-0000-0000-000000000001', expected_quantity: 50, received_quantity: 0, products: { name: '무선 바코드 스캐너 BT-100', barcode: '8801234000001' } },
    ],
  },
  {
    id: 'prev-rco-0000-0000-000000000002', title: '라벨 롤 입고', status: 'completed', memo: null,
    created_at: '2026-06-20T00:00:00Z', completed_at: '2026-06-22T00:00:00Z', confirmed_at: '2026-06-22T00:00:00Z',
    receiving_items: [
      { id: 'prev-ri-0000-0000-000000000002', product_id: 'prev-prod-0000-0000-000000000008', expected_quantity: 500, received_quantity: 500, products: { name: '라벨 롤 (57x40, 1000매)', barcode: '8801234000008' } },
    ],
  },
];

export const PREVIEW_WAREHOUSES = [
  { id: 'prev-wh-0000-0000-000000000001', name: '본사 1창고', code: 'WH-01', address: '경기 화성시', total_area: 800, usable_area: 650, warehouse_type: 'main', manager_name: '김창고', manager_contact: '010-1111-2222', is_active: true, memo: null, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'prev-wh-0000-0000-000000000002', name: '본사 2창고', code: 'WH-02', address: '인천광역시', total_area: 400, usable_area: 320, warehouse_type: 'overflow', manager_name: '이보관', manager_contact: '010-3333-4444', is_active: true, memo: null, created_at: '2025-02-01T00:00:00Z', updated_at: '2025-02-01T00:00:00Z' },
];

export function getPreviewSerialProducts() {
  return PREVIEW_PRODUCTS.map((p) => ({
    id: p.id, name: p.name, barcode: p.barcode, base_stock: p.base_stock,
    width_cm: p.width_cm, height_cm: p.height_cm, depth_cm: p.depth_cm, weight_kg: p.weight_kg,
    categories: null,
  }));
}
