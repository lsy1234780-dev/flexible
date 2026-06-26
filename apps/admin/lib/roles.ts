// 부서 (기본 타입 — DB에서 동적으로 추가 가능)
export type Department = string;

// 직급 (기본 타입 — DB에서 동적으로 추가 가능)
export type Position = string;

export interface UserRole {
  department: Department;
  position: Position;
  positionLevel?: number; // positions.level 값 (DB에서 조회)
  extraMenus?: string[]; // 그룹 롤에서 부여받은 추가 메뉴
}

// 기본값 (메타데이터 없는 기존 유저용)
export const DEFAULT_ROLE: UserRole = { department: 'management', position: 'director' };

// 전체 메뉴 목록 (설정 UI용)
export const ALL_MENUS: { href: string; label: string }[] = [
  { href: '/products', label: '제품 관리' },
  { href: '/categories', label: '카테고리' },
  { href: '/inventory', label: '재고 현황' },
  { href: '/companies', label: '거래처 관리' },
  { href: '/receiving', label: '발주 관리' },
  { href: '/orders', label: '수주 관리' },
  { href: '/quotations', label: '견적서' },
  { href: '/serials', label: '시리얼 관리' },
  { href: '/lots', label: 'LOT 관리' },
  { href: '/as', label: 'A/S 관리' },
  { href: '/warehouses', label: '창고 관리' },
];

// 메뉴 접근 규칙 타입 (DB에서 가져옴)
export interface MenuAccessRule {
  menu_href: string;
  allowed_departments: string[];
  allowed_positions: string[];
}

// 메뉴 접근 가능 여부 (DB 규칙 + 그룹 추가 메뉴 병합)
export function canAccessMenu(
  href: string,
  role: UserRole,
  rules?: MenuAccessRule[],
  superAdminMinLevel?: number,
): boolean {
  // 마스터 레벨 이상이면 모든 메뉴 접근 가능
  const minLevel = superAdminMinLevel ?? 7;
  if (role.positionLevel !== undefined && role.positionLevel >= minLevel) return true;

  // 외부 링크는 항상 접근 가능
  if (href.startsWith('http')) return true;

  // 그룹 롤에서 추가된 메뉴면 접근 가능
  if (role.extraMenus?.includes(href)) return true;

  // DB 규칙이 없으면 전체 접근 허용 (fallback)
  if (!rules) return true;

  const rule = rules.find((r) => r.menu_href === href);
  if (!rule) return true; // 규칙 없는 메뉴는 전체 접근

  // 부서 체크: 빈 배열이면 전체 허용
  const deptOk = rule.allowed_departments.length === 0
    || rule.allowed_departments.includes(role.department);

  // 직급 체크: 빈 배열이면 전체 허용
  const posOk = rule.allowed_positions.length === 0
    || rule.allowed_positions.includes(role.position);

  // AND 조건: 부서와 직급 모두 해당해야 접근
  return deptOk && posOk;
}

// superadmin 여부 (직급 레벨 기반)
export function isSuperAdmin(role: UserRole, superAdminMinLevel?: number): boolean {
  const minLevel = superAdminMinLevel ?? 7;
  if (role.positionLevel !== undefined) {
    return role.positionLevel >= minLevel;
  }
  // positionLevel이 없으면 하위호환: director면 마스터
  return role.position === 'director';
}

// app_metadata에서 역할 파싱
export function parseRole(
  appMetadata: Record<string, unknown> | undefined,
  validDepartments?: string[],
  validPositions?: string[],
): UserRole {
  if (!appMetadata) return DEFAULT_ROLE;

  const dept = appMetadata.department as string | undefined;
  const pos = appMetadata.position as string | undefined;

  // validDepartments/Positions가 있으면 그걸로 검증, 없으면 그냥 통과
  const deptValid = !validDepartments || validDepartments.includes(dept ?? '');
  const posValid = !validPositions || validPositions.includes(pos ?? '');

  return {
    department: (deptValid && dept) ? dept : DEFAULT_ROLE.department,
    position: (posValid && pos) ? pos : DEFAULT_ROLE.position,
  };
}
