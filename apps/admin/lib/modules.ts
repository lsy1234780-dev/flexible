// 모듈 게이팅 — "조립형 워크스페이스"의 실체.
// 메뉴(href)를 workspace_modules.module_key에 매핑하고,
// 워크스페이스에서 그 모듈이 켜져 있을 때만 메뉴를 노출한다.
// (RBAC canAccessMenu는 "누가" 볼 수 있나, 이건 "이 워크스페이스가 그 기능을 쓰나".)
//
// 매핑 기준: docs/architecture/module-map.md
// 주의: 기본 워크스페이스 시드에서 아래 매핑된 모듈은 전부 ON이라 기존 화면은 그대로.

export const MENU_MODULE_MAP: Record<string, string> = {
  '/products': 'products',
  '/categories': 'products',
  '/inventory': 'inventory',
  '/lots': 'serials',
  '/companies': 'partners',
  '/receiving': 'receiving',
  '/orders': 'orders',
  '/quotations': 'quotations',
  '/warranty': 'fulfillment',
  '/as': 'service',
  '/profit-loss': 'analytics',
  '/deals': 'crm_pipeline',
  '/chat': 'chat',
  // 물류관리 그룹 전체 → logistics 모듈 하나로 통합 게이팅
  '/warehouses': 'logistics',
  '/serials': 'logistics',
  '/receiving-orders': 'logistics',
  // 근태 그룹 전체 → attendance 모듈
  '/attendance': 'attendance',
  '/attendance/leaves': 'attendance',
  '/attendance/team': 'attendance',
  '/attendance/policy': 'attendance',
  // 경비 그룹 전체 → expenses 모듈
  '/expenses': 'expenses',
  '/expenses/finance': 'expenses',
};

// 전체 모듈 키 (preview/fallback에서 "전부 켜짐"으로 취급)
export const ALL_MODULE_KEYS = [
  'platform', 'partners', 'products', 'quotations', 'orders', 'inventory', 'serials',
  'receiving', 'purchasing', 'supply', 'fulfillment', 'service', 'crm_basic', 'analytics',
  'b2b_portal', 'crm_pipeline', 'chat', 'ecommerce', 'pos', 'warranty', 'logistics',
  'attendance', 'expenses',
] as const;

// 모듈 카탈로그 — 설정 화면의 토글 목록 소스 (docs/architecture/module-map.md 기준).
// tier 'core' = 항상 ON(끌 수 없음). comingSoon = 아직 화면 미구현(토글 비활성).
export interface ModuleInfo {
  key: string;
  label: string;
  description: string;
  tier: 'core' | 'optional';
  comingSoon?: boolean;
}

export const MODULE_CATALOG: ModuleInfo[] = [
  { key: 'partners', label: '거래처/고객', description: '거래처·단가 관리', tier: 'core' },
  { key: 'products', label: '제품/카탈로그', description: '제품·카테고리', tier: 'core' },
  { key: 'platform', label: '인증·권한·설정', description: '로그인·RBAC·설정', tier: 'core' },
  { key: 'inventory', label: '재고·창고', description: '재고 현황·창고 관리', tier: 'optional' },
  { key: 'serials', label: '시리얼·LOT 추적', description: '시리얼 바코드·LOT', tier: 'optional' },
  { key: 'receiving', label: '입고', description: '입고지시·입고 작업', tier: 'optional' },
  { key: 'logistics', label: '물류관리', description: '창고·시리얼·입고작업 물류 화면 전체', tier: 'optional' },
  { key: 'purchasing', label: '발주·구매', description: '구매발주·대금', tier: 'optional' },
  { key: 'supply', label: '선적·통관', description: '수입 공급망', tier: 'optional' },
  { key: 'orders', label: '수주(판매주문)', description: '주문 관리', tier: 'optional' },
  { key: 'quotations', label: '견적', description: '견적서·PDF·이메일', tier: 'optional' },
  { key: 'fulfillment', label: '출고·물류', description: '출고·배송 추적', tier: 'optional' },
  { key: 'service', label: 'A/S·수리', description: 'AS 접수·수리 이력', tier: 'optional' },
  { key: 'crm_basic', label: '거래처 이력', description: 'CRM 메모·활동 로그', tier: 'optional' },
  { key: 'analytics', label: '손익·분석', description: '손익계산서·대시보드', tier: 'optional' },
  { key: 'b2b_portal', label: 'B2B 포털', description: '협력사 셀프 포털', tier: 'optional' },
  { key: 'crm_pipeline', label: '영업 파이프라인', description: '리드→딜 관리', tier: 'optional' },
  { key: 'chat', label: '팀 채팅', description: '채팅 + 엔티티 멘션', tier: 'optional' },
  { key: 'attendance', label: '근태', description: '출퇴근 기록·휴가·팀 부재 현황', tier: 'optional' },
  { key: 'expenses', label: '경비', description: '경비 청구·결재·정산', tier: 'optional' },
  { key: 'warranty', label: '보증 관리', description: '보증 추적', tier: 'optional', comingSoon: true },
  { key: 'ecommerce', label: '이커머스 연동', description: '온라인스토어', tier: 'optional', comingSoon: true },
  { key: 'pos', label: 'POS', description: '오프라인 판매', tier: 'optional', comingSoon: true },
];

// 해당 메뉴가 현재 워크스페이스에서 켜진 모듈에 속하는지.
// - enabledModules가 없으면(미전달) 게이팅하지 않음 → 안전 fallback(전부 노출).
// - 매핑 없는 메뉴(외부 링크, /settings 등 코어)는 항상 허용.
export function isMenuModuleEnabled(href: string, enabledModules?: string[] | null): boolean {
  if (!enabledModules) return true;
  const moduleKey = MENU_MODULE_MAP[href];
  if (!moduleKey) return true;
  return enabledModules.includes(moduleKey);
}

// 페이지 경로가 속한 모듈 키 — 라우트 단위 게이팅(middleware)용.
// 메뉴 href와 정확히 같거나 그 하위 경로(/deals/123, /quotations/new)면 해당 모듈.
// 여러 개가 맞으면 가장 긴(구체적인) href를 우선한다. 매핑 없는 경로(/settings, /inbox 등 코어)는 null.
export function moduleForPath(pathname: string): string | null {
  let bestHref = '';
  for (const href of Object.keys(MENU_MODULE_MAP)) {
    const matches = pathname === href || pathname.startsWith(href + '/');
    if (matches && href.length > bestHref.length) bestHref = href;
  }
  return bestHref ? MENU_MODULE_MAP[bestHref] : null;
}
