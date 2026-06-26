'use server';

import { createClient } from '@/lib/supabase/server';

export interface MonthlyRow {
  month: string;         // 'YYYY-MM'
  revenue: number;
  cost: number;
  profit: number;
  margin_rate: number;
  order_count: number;
  qty_sold: number;
}

export interface ProductMarginRow {
  product_id: string;
  product_name: string;
  barcode: string;
  qty_sold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_rate: number;
  order_count: number;
}

export interface CompanyPlRow {
  company_id: string;
  company_name: string;
  order_count: number;
  qty_sold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_rate: number;
}

export interface TransactionRow {
  order_id: string;
  date: string;          // 'YYYY-MM-DD'
  company_name: string;
  product_name: string;
  qty: number;
  unit_price: number;
  cost_price: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_rate: number;
}

export interface PlSummary {
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  margin_rate: number;
  order_count: number;
  qty_sold: number;
}

// ─────────────────────────────────────────────
// 미리보기 더미 데이터
// ─────────────────────────────────────────────

function buildPreviewData(from?: string, to?: string) {
  const raw = [
    // 2025-10
    { order_id: 'preview-001', date: '2025-10-04', month: '2025-10', company_id: 'c1', company_name: 'AA유통',  product_id: 'p1', product_name: '무선 바코드 스캐너 BT-100',   barcode: '8801234000001', qty: 8,  unit_price: 92000,  cost_price: 58000 },
    { order_id: 'preview-002', date: '2025-10-11', month: '2025-10', company_id: 'c2', company_name: 'BB전자',   product_id: 'p2', product_name: '2D QR 스캐너 Q-200',          barcode: '8801234000002', qty: 5,  unit_price: 102000, cost_price: 63000 },
    { order_id: 'preview-002', date: '2025-10-11', month: '2025-10', company_id: 'c1', company_name: 'AA유통',   product_id: 'p1', product_name: '무선 바코드 스캐너 BT-100',   barcode: '8801234000001', qty: 3,  unit_price: 88000,  cost_price: 58000 },
    { order_id: 'preview-003', date: '2025-10-22', month: '2025-10', company_id: 'c3', company_name: 'CC물류',   product_id: 'p4', product_name: '라벨 프린터 LP-400',           barcode: '8801234000004', qty: 3,  unit_price: 220000, cost_price: 148000 },
    // 2025-11
    { order_id: 'preview-004', date: '2025-11-05', month: '2025-11', company_id: 'c1', company_name: 'AA유통',  product_id: 'p3', product_name: '고정식 바코드 리더 F-300',      barcode: '8801234000003', qty: 4,  unit_price: 160000, cost_price: 105000 },
    { order_id: 'preview-005', date: '2025-11-13', month: '2025-11', company_id: 'c2', company_name: 'BB전자',   product_id: 'p6', product_name: '산업용 PDA 단말기 P-600',       barcode: '8801234000006', qty: 2,  unit_price: 340000, cost_price: 225000 },
    { order_id: 'preview-006', date: '2025-11-19', month: '2025-11', company_id: 'c2', company_name: 'BB전자',   product_id: 'p6', product_name: '산업용 PDA 단말기 P-600',       barcode: '8801234000006', qty: 1,  unit_price: 325000, cost_price: 225000 },
    { order_id: 'preview-007', date: '2025-11-27', month: '2025-11', company_id: 'c4', company_name: 'DD테크',   product_id: 'p8', product_name: '라벨 롤 (57x40, 1000매)',       barcode: '8801234000008', qty: 50, unit_price: 13000,  cost_price: 7500 },
    // 2025-12
    { order_id: 'preview-008', date: '2025-12-03', month: '2025-12', company_id: 'c1', company_name: 'AA유통',  product_id: 'p1', product_name: '무선 바코드 스캐너 BT-100',   barcode: '8801234000001', qty: 12, unit_price: 89000,  cost_price: 58000 },
    { order_id: 'preview-009', date: '2025-12-10', month: '2025-12', company_id: 'c3', company_name: 'CC물류',   product_id: 'p5', product_name: '감열 라벨 프린터 TP-500',      barcode: '8801234000005', qty: 3,  unit_price: 195000, cost_price: 132000 },
    { order_id: 'preview-008', date: '2025-12-10', month: '2025-12', company_id: 'c1', company_name: 'AA유통',   product_id: 'p1', product_name: '무선 바코드 스캐너 BT-100',   barcode: '8801234000001', qty: 5,  unit_price: 85000,  cost_price: 58000 },
    { order_id: 'preview-010', date: '2025-12-18', month: '2025-12', company_id: 'c2', company_name: 'BB전자',   product_id: 'p7', product_name: '핸드헬드 터미널 HT-700',       barcode: '8801234000007', qty: 2,  unit_price: 295000, cost_price: 198000 },
    { order_id: 'preview-011', date: '2025-12-24', month: '2025-12', company_id: 'c4', company_name: 'DD테크',   product_id: 'p9', product_name: '라벨 롤 (100x70, 500매)',       barcode: '8801234000009', qty: 30, unit_price: 19000,  cost_price: 11500 },
    // 2026-01
    { order_id: 'preview-012', date: '2026-01-07', month: '2026-01', company_id: 'c1', company_name: 'AA유통',  product_id: 'p6', product_name: '산업용 PDA 단말기 P-600',       barcode: '8801234000006', qty: 3,  unit_price: 335000, cost_price: 225000 },
    { order_id: 'preview-013', date: '2026-01-14', month: '2026-01', company_id: 'c3', company_name: 'CC물류',   product_id: 'p1', product_name: '무선 바코드 스캐너 BT-100',   barcode: '8801234000001', qty: 6,  unit_price: 91000,  cost_price: 58000 },
    { order_id: 'preview-014', date: '2026-01-14', month: '2026-01', company_id: 'c3', company_name: 'CC물류',   product_id: 'p1', product_name: '무선 바코드 스캐너 BT-100',   barcode: '8801234000001', qty: 4,  unit_price: 95000,  cost_price: 58000 },
    { order_id: 'preview-015', date: '2026-01-21', month: '2026-01', company_id: 'c2', company_name: 'BB전자',   product_id: 'p4', product_name: '라벨 프린터 LP-400',           barcode: '8801234000004', qty: 5,  unit_price: 215000, cost_price: 148000 },
    { order_id: 'preview-016', date: '2026-01-28', month: '2026-01', company_id: 'c4', company_name: 'DD테크',   product_id: 'p8', product_name: '라벨 롤 (57x40, 1000매)',       barcode: '8801234000008', qty: 80, unit_price: 12500,  cost_price: 7500 },
    // 2026-02
    { order_id: 'preview-017', date: '2026-02-05', month: '2026-02', company_id: 'c1', company_name: 'AA유통',  product_id: 'p2', product_name: '2D QR 스캐너 Q-200',          barcode: '8801234000002', qty: 7,  unit_price: 105000, cost_price: 63000 },
    { order_id: 'preview-018', date: '2026-02-12', month: '2026-02', company_id: 'c3', company_name: 'CC물류',   product_id: 'p6', product_name: '산업용 PDA 단말기 P-600',       barcode: '8801234000006', qty: 2,  unit_price: 330000, cost_price: 225000 },
    { order_id: 'preview-017', date: '2026-02-12', month: '2026-02', company_id: 'c1', company_name: 'AA유통',   product_id: 'p2', product_name: '2D QR 스캐너 Q-200',          barcode: '8801234000002', qty: 3,  unit_price: 98000,  cost_price: 63000 },
    { order_id: 'preview-019', date: '2026-02-19', month: '2026-02', company_id: 'c2', company_name: 'BB전자',   product_id: 'p3', product_name: '고정식 바코드 리더 F-300',      barcode: '8801234000003', qty: 5,  unit_price: 158000, cost_price: 105000 },
    { order_id: 'preview-020', date: '2026-02-25', month: '2026-02', company_id: 'c4', company_name: 'DD테크',   product_id: 'p10', product_name: '스캐너 충전 크래들 CR-100',    barcode: '8801234000010', qty: 15, unit_price: 38000,  cost_price: 22000 },
    // 2026-03
    { order_id: 'preview-021', date: '2026-03-04', month: '2026-03', company_id: 'c1', company_name: 'AA유통',  product_id: 'p7', product_name: '핸드헬드 터미널 HT-700',       barcode: '8801234000007', qty: 4,  unit_price: 292000, cost_price: 198000 },
    { order_id: 'preview-022', date: '2026-03-11', month: '2026-03', company_id: 'c3', company_name: 'CC물류',   product_id: 'p4', product_name: '라벨 프린터 LP-400',           barcode: '8801234000004', qty: 6,  unit_price: 218000, cost_price: 148000 },
    { order_id: 'preview-021', date: '2026-03-11', month: '2026-03', company_id: 'c1', company_name: 'AA유통',   product_id: 'p7', product_name: '핸드헬드 터미널 HT-700',       barcode: '8801234000007', qty: 2,  unit_price: 280000, cost_price: 198000 },
    { order_id: 'preview-023', date: '2026-03-18', month: '2026-03', company_id: 'c2', company_name: 'BB전자',   product_id: 'p1', product_name: '무선 바코드 스캐너 BT-100',   barcode: '8801234000001', qty: 10, unit_price: 93000,  cost_price: 58000 },
    { order_id: 'preview-024', date: '2026-03-20', month: '2026-03', company_id: 'c4', company_name: 'DD테크',   product_id: 'p9', product_name: '라벨 롤 (100x70, 500매)',       barcode: '8801234000009', qty: 40, unit_price: 19500,  cost_price: 11500 },
  ];

  const filtered = raw.filter((r) => {
    if (from && r.month < from.slice(0, 7)) return false;
    if (to   && r.month > to.slice(0, 7))   return false;
    return true;
  });

  return filtered;
}

function aggregate(rows: ReturnType<typeof buildPreviewData>) {
  const monthMap = new Map<string, MonthlyRow>();
  const productMap = new Map<string, ProductMarginRow>();
  const companyMap = new Map<string, CompanyPlRow>();
  const monthlyProductMap = new Map<string, Map<string, ProductMarginRow>>();
  const monthlyTransactionsMap = new Map<string, TransactionRow[]>();

  for (const r of rows) {
    const revenue = r.unit_price  * r.qty;
    const cost    = r.cost_price  * r.qty;
    const profit  = revenue - cost;

    // monthly
    if (!monthMap.has(r.month)) {
      monthMap.set(r.month, { month: r.month, revenue: 0, cost: 0, profit: 0, margin_rate: 0, order_count: 0, qty_sold: 0 });
    }
    const m = monthMap.get(r.month)!;
    m.revenue += revenue; m.cost += cost; m.profit += profit;
    m.order_count += 1; m.qty_sold += r.qty;

    // monthly transactions
    if (!monthlyTransactionsMap.has(r.month)) monthlyTransactionsMap.set(r.month, []);
    monthlyTransactionsMap.get(r.month)!.push({
      order_id: (r as { order_id?: string }).order_id ?? '',
      date: (r as { date?: string }).date ?? r.month + '-01',
      company_name: r.company_name,
      product_name: r.product_name,
      qty: r.qty,
      unit_price: r.unit_price,
      cost_price: r.cost_price,
      revenue,
      cost,
      profit,
      margin_rate: revenue > 0 ? profit / revenue * 100 : 0,
    });

    // monthly product breakdown
    if (!monthlyProductMap.has(r.month)) monthlyProductMap.set(r.month, new Map());
    const mpMap = monthlyProductMap.get(r.month)!;
    if (!mpMap.has(r.product_id)) {
      mpMap.set(r.product_id, { product_id: r.product_id, product_name: r.product_name, barcode: r.barcode, qty_sold: 0, revenue: 0, cost: 0, profit: 0, margin_rate: 0, order_count: 0 });
    }
    const mp = mpMap.get(r.product_id)!;
    mp.revenue += revenue; mp.cost += cost; mp.profit += profit;
    mp.qty_sold += r.qty; mp.order_count += 1;

    // product
    if (!productMap.has(r.product_id)) {
      productMap.set(r.product_id, { product_id: r.product_id, product_name: r.product_name, barcode: r.barcode, qty_sold: 0, revenue: 0, cost: 0, profit: 0, margin_rate: 0, order_count: 0 });
    }
    const p = productMap.get(r.product_id)!;
    p.revenue += revenue; p.cost += cost; p.profit += profit;
    p.qty_sold += r.qty; p.order_count += 1;

    // company
    if (!companyMap.has(r.company_id)) {
      companyMap.set(r.company_id, { company_id: r.company_id, company_name: r.company_name, order_count: 0, qty_sold: 0, revenue: 0, cost: 0, profit: 0, margin_rate: 0 });
    }
    const c = companyMap.get(r.company_id)!;
    c.revenue += revenue; c.cost += cost; c.profit += profit;
    c.order_count += 1; c.qty_sold += r.qty;
  }

  const monthly = [...monthMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, margin_rate: r.revenue > 0 ? r.profit / r.revenue * 100 : 0 }));

  const products = [...productMap.values()]
    .sort((a, b) => b.profit - a.profit)
    .map((r) => ({ ...r, margin_rate: r.revenue > 0 ? r.profit / r.revenue * 100 : 0 }));

  const companies = [...companyMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((r) => ({ ...r, margin_rate: r.revenue > 0 ? r.profit / r.revenue * 100 : 0 }));

  const monthlyProducts: Record<string, ProductMarginRow[]> = {};
  for (const [month, mpMap] of monthlyProductMap) {
    monthlyProducts[month] = [...mpMap.values()]
      .map((r) => ({ ...r, margin_rate: r.revenue > 0 ? r.profit / r.revenue * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  const monthlyTransactions: Record<string, TransactionRow[]> = {};
  for (const [month, txList] of monthlyTransactionsMap) {
    monthlyTransactions[month] = txList.sort((a, b) => a.date.localeCompare(b.date));
  }

  const summary: PlSummary = monthly.reduce(
    (acc, m) => ({
      total_revenue: acc.total_revenue + m.revenue,
      total_cost:    acc.total_cost    + m.cost,
      total_profit:  acc.total_profit  + m.profit,
      margin_rate:   0,
      order_count:   acc.order_count   + m.order_count,
      qty_sold:      acc.qty_sold      + m.qty_sold,
    }),
    { total_revenue: 0, total_cost: 0, total_profit: 0, margin_rate: 0, order_count: 0, qty_sold: 0 },
  );
  summary.margin_rate = summary.total_revenue > 0
    ? summary.total_profit / summary.total_revenue * 100
    : 0;

  return { summary, monthly, products, companies, monthlyProducts, monthlyTransactions };
}

// ─────────────────────────────────────────────
// 실제 DB 조회
// ─────────────────────────────────────────────

async function fetchFromDb(from?: string, to?: string) {
  const supabase = await createClient();

  // 1. 수주 목록 (confirmed / shipped / completed)
  let ordersQuery = supabase
    .from('orders')
    .select('id, company_id, confirmed_at, companies(id, name)')
    .in('status', ['confirmed', 'shipped', 'completed']);
  if (from) ordersQuery = ordersQuery.gte('confirmed_at', from);
  if (to)   ordersQuery = ordersQuery.lte('confirmed_at', to + 'T23:59:59');

  const { data: orders, error: oErr } = await ordersQuery;
  if (oErr) throw new Error(oErr.message);
  if (!orders || orders.length === 0) {
    return { summary: { total_revenue: 0, total_cost: 0, total_profit: 0, margin_rate: 0, order_count: 0, qty_sold: 0 }, monthly: [], products: [], companies: [], monthlyProducts: {}, monthlyTransactions: {} };
  }

  const orderIds = orders.map((o) => o.id);

  // 2. 주문 항목 + 제품 원가
  const { data: items, error: iErr } = await supabase
    .from('order_items')
    .select('order_id, quantity, unit_price, products(id, name, barcode, cost_price)')
    .in('order_id', orderIds);
  if (iErr) throw new Error(iErr.message);

  // 3. order_id → order 메타 매핑
  type OrderMeta = { company_id: string; company_name: string; confirmed_at: string };
  const orderMeta = new Map<string, OrderMeta>();
  for (const o of orders) {
    const co = o.companies as unknown as { id: string; name: string } | null;
    orderMeta.set(o.id, {
      company_id:   co?.id   ?? '',
      company_name: co?.name ?? '(거래처 없음)',
      confirmed_at: o.confirmed_at ?? '',
    });
  }

  // raw rows 조합
  const raw = (items ?? []).map((item) => {
    const meta   = orderMeta.get(item.order_id)!;
    const prod   = item.products as unknown as { id: string; name: string; barcode: string; cost_price: number } | null;
    const month  = meta.confirmed_at.slice(0, 7);
    return {
      order_id:      item.order_id,
      date:          meta.confirmed_at.slice(0, 10),
      month,
      company_id:    meta.company_id,
      company_name:  meta.company_name,
      product_id:    prod?.id         ?? '',
      product_name:  prod?.name       ?? '(제품 없음)',
      barcode:       prod?.barcode    ?? '',
      qty:           item.quantity,
      unit_price:    item.unit_price,
      cost_price:    prod?.cost_price ?? 0,
    };
  });

  return aggregate(raw);
}

// ─────────────────────────────────────────────
// 공개 액션
// ─────────────────────────────────────────────

export async function getPlData(options?: { from?: string; to?: string }) {
  if (process.env.PREVIEW_MODE === 'true') {
    const raw = buildPreviewData(options?.from, options?.to);
    return aggregate(raw);
  }
  return fetchFromDb(options?.from, options?.to);
}
