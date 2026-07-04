// 모듈 엔티티 레지스트리 — "모듈화된 OS"의 단일 계약(Single Source of Truth).
//
// 각 모듈이 "나는 이런 엔티티를 제공한다"를 여기서 선언한다.
// 멘션, (후속) 레코드 역링크, 글로벌 검색 등 모든 cross-cutting 기능은
// 이 레지스트리를 읽기만 한다 — 채팅/검색이 개별 모듈을 직접 알지 않는다.
//
// 유기성: module 키가 workspace_modules에서 꺼지면 그 엔티티는
//         멘션·검색 후보에서 자동으로 사라진다(entitiesForModules가 게이팅).
//         새 모듈을 붙이면 여기 한 줄 추가로 모든 소비자에 동시에 노출된다.
//
// 주의: 이 파일은 서버(테이블 검색)·클라이언트(칩/링크 렌더) 양쪽에서 import 된다.
//       따라서 순수 데이터 + 순수 함수만 둔다(supabase/서버 의존 금지).

// 테이블 기반 엔티티의 검색 정의
export interface EntitySource {
  table: string;
  labelColumns: string[];   // 표시 라벨(여러 개면 ' · '로 결합)
  searchColumns: string[];  // ilike 검색 대상 컬럼
  orderColumn: string;      // 검색어 없을 때 최근순 기준
  orderAsc?: boolean;
}

// 멤버(사람)처럼 테이블이 아니라 전용 경로(RPC)로 가져오는 엔티티
export interface MembersSource {
  kind: 'members';
}

export interface EntityDef {
  type: string;             // 'company', 'deal', ... (message_mentions.entity_type)
  label: string;            // '거래처'
  module: string | null;    // 소유 모듈 키(workspace_modules.module_key). null = 코어(항상)
  source: EntitySource | MembersSource;
  href: (id: string) => string; // 멘션 칩 클릭 시 이동(상세 없으면 '#')
  chip: string;             // tailwind 칩 색상
}

export const ENTITY_REGISTRY: EntityDef[] = [
  {
    type: 'user', label: '멤버', module: null,
    source: { kind: 'members' },
    href: () => '#',
    chip: 'bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200',
  },
  {
    type: 'company', label: '거래처', module: 'partners',
    source: { table: 'companies', labelColumns: ['name'], searchColumns: ['name'], orderColumn: 'created_at' },
    href: (id) => `/companies/${id}`,
    chip: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
  },
  {
    type: 'deal', label: '딜', module: 'crm_pipeline',
    source: { table: 'deals', labelColumns: ['title'], searchColumns: ['title'], orderColumn: 'updated_at' },
    href: () => '/deals',
    chip: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200',
  },
  {
    type: 'order', label: '수주', module: 'orders',
    source: { table: 'orders', labelColumns: ['order_number'], searchColumns: ['order_number'], orderColumn: 'created_at' },
    href: (id) => `/orders/${id}`,
    chip: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200',
  },
  {
    type: 'quotation', label: '견적', module: 'quotations',
    source: { table: 'quotations', labelColumns: ['number'], searchColumns: ['number'], orderColumn: 'issued_at' },
    href: (id) => `/quotations/${id}`,
    chip: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200',
  },
  {
    type: 'product', label: '제품', module: 'products',
    source: { table: 'products', labelColumns: ['name'], searchColumns: ['name'], orderColumn: 'created_at' },
    href: (id) => `/products/${id}`,
    chip: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200',
  },
  {
    type: 'category', label: '카테고리', module: 'products',
    source: { table: 'categories', labelColumns: ['name'], searchColumns: ['name'], orderColumn: 'sort_order', orderAsc: true },
    href: () => '/categories',
    chip: 'bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200',
  },
  {
    type: 'warehouse', label: '창고', module: 'logistics',
    source: { table: 'warehouses', labelColumns: ['name'], searchColumns: ['name'], orderColumn: 'created_at' },
    href: (id) => `/warehouses/${id}`,
    chip: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border-cyan-200',
  },
  {
    // 주의: table은 receiving_orders지만 상세 라우트는 /receiving-orders/[id] — /receiving/[id]는
    // 이름이 비슷해 헷갈리지만 실제로는 구매발주(purchase_orders) 상세 페이지라 다른 엔티티다.
    type: 'receiving', label: '입고', module: 'receiving',
    source: { table: 'receiving_orders', labelColumns: ['title'], searchColumns: ['title'], orderColumn: 'created_at' },
    href: (id) => `/receiving-orders/${id}`,
    chip: 'bg-lime-50 text-lime-700 hover:bg-lime-100 border-lime-200',
  },
  {
    // 상세 라우트는 /receiving/[id] — 위 receiving(입고, receiving_orders) 엔티티와 이름이
    // 헷갈리지만 서로 다른 테이블/페이지다.
    type: 'purchase_order', label: '구매발주', module: 'receiving',
    source: { table: 'purchase_orders', labelColumns: ['title'], searchColumns: ['title', 'po_number'], orderColumn: 'created_at' },
    href: (id) => `/receiving/${id}`,
    chip: 'bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 border-fuchsia-200',
  },
  {
    // 휴가 신청 — 승인(approvals entity_type='leave')·인박스 링크·검색용.
    // 개별 상세 페이지가 없어 목록 페이지로 이동.
    type: 'leave', label: '휴가', module: 'attendance',
    source: { table: 'leave_requests', labelColumns: ['user_name'], searchColumns: ['user_name', 'reason'], orderColumn: 'created_at' },
    href: () => '/attendance/leaves',
    chip: 'bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200',
  },
  {
    // 초과근무 사전 신청 — 승인(approvals entity_type='overtime')·인박스 링크용.
    type: 'overtime', label: '초과근무', module: 'attendance',
    source: { table: 'overtime_requests', labelColumns: ['user_name'], searchColumns: ['user_name', 'reason'], orderColumn: 'created_at' },
    href: () => '/attendance',
    chip: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200',
  },
  {
    // 경비 청구 — 승인(approvals entity_type='expense')·인박스 링크·레코드 스레드용.
    // RLS가 본인+재무 담당만 조회 허용이라 검색/멘션 후보도 자연히 그 범위로 제한된다.
    type: 'expense', label: '경비', module: 'expenses',
    source: { table: 'expense_claims', labelColumns: ['title', 'user_name'], searchColumns: ['title', 'user_name'], orderColumn: 'created_at' },
    href: (id) => `/expenses/${id}`,
    chip: 'bg-pink-50 text-pink-700 hover:bg-pink-100 border-pink-200',
  },
  {
    type: 'as', label: 'A/S', module: 'service',
    source: { table: 'as_requests', labelColumns: ['number', 'customer_name'], searchColumns: ['number', 'customer_name'], orderColumn: 'created_at' },
    href: (id) => `/as/${id}`,
    chip: 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200',
  },
];

// 켜진 모듈의 엔티티만 (코어는 항상). — 유기적 게이팅의 핵심
export function entitiesForModules(enabledModules: string[]): EntityDef[] {
  return ENTITY_REGISTRY.filter((e) => e.module === null || enabledModules.includes(e.module));
}

export function getEntityDef(type: string): EntityDef | undefined {
  return ENTITY_REGISTRY.find((e) => e.type === type);
}

// ─── 프레젠테이션 헬퍼 (레지스트리에서 파생) ───
export function entityHref(type: string, id: string): string {
  const def = getEntityDef(type);
  return def ? def.href(id) : '#';
}

export function entityChipClass(type: string): string {
  return getEntityDef(type)?.chip ?? 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200';
}

export const ENTITY_LABEL: Record<string, string> = Object.fromEntries(
  ENTITY_REGISTRY.map((e) => [e.type, e.label]),
);
