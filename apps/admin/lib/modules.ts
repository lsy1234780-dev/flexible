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
  '/warehouses': 'inventory',
  '/lots': 'serials',
  '/serials': 'serials',
  '/companies': 'partners',
  '/receiving': 'receiving',
  '/receiving-orders': 'receiving',
  '/orders': 'orders',
  '/quotations': 'quotations',
  '/warranty': 'fulfillment', // 출고현황 = 출고/물류 추적
  '/as': 'service',
  '/profit-loss': 'analytics',
};

// 전체 모듈 키 (preview/fallback에서 "전부 켜짐"으로 취급)
export const ALL_MODULE_KEYS = [
  'platform', 'partners', 'products', 'quotations', 'orders', 'inventory', 'serials',
  'receiving', 'purchasing', 'supply', 'fulfillment', 'service', 'crm_basic', 'analytics',
  'b2b_portal', 'crm_pipeline', 'chat', 'ecommerce', 'pos', 'warranty',
] as const;

// 해당 메뉴가 현재 워크스페이스에서 켜진 모듈에 속하는지.
// - enabledModules가 없으면(미전달) 게이팅하지 않음 → 안전 fallback(전부 노출).
// - 매핑 없는 메뉴(외부 링크, /settings 등 코어)는 항상 허용.
export function isMenuModuleEnabled(href: string, enabledModules?: string[] | null): boolean {
  if (!enabledModules) return true;
  const moduleKey = MENU_MODULE_MAP[href];
  if (!moduleKey) return true;
  return enabledModules.includes(moduleKey);
}
