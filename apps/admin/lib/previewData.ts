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
