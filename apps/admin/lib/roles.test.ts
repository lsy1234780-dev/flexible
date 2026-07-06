import { describe, it, expect } from 'vitest';
import { canAccessMenu, isSuperAdmin, parseRole, DEFAULT_ROLE, type UserRole, type MenuAccessRule } from './roles';

// RBAC 접근 판정은 보안 핵심 로직이라 회귀 방어가 특히 중요하다.
// (CLAUDE.md "권한 시스템" 섹션의 접근 판정 순서를 그대로 검증)

const rules: MenuAccessRule[] = [
  { menu_href: '/orders', allowed_departments: ['sales'], allowed_positions: ['manager'] },
  { menu_href: '/inventory', allowed_departments: [], allowed_positions: [] }, // 전체 허용
  { menu_href: '/quotations', allowed_departments: ['sales'], allowed_positions: [] }, // 부서만 제한
];

const role = (over: Partial<UserRole> = {}): UserRole => ({ department: 'sales', position: 'staff', ...over });

describe('canAccessMenu', () => {
  it('마스터 레벨(>=7)이면 규칙과 무관하게 전체 접근', () => {
    expect(canAccessMenu('/orders', role({ department: 'logistics', position: 'x', positionLevel: 7 }), rules)).toBe(true);
    expect(canAccessMenu('/anything', role({ positionLevel: 9 }), rules)).toBe(true);
  });

  it('외부 링크(http)는 항상 접근', () => {
    expect(canAccessMenu('https://example.com', role({ department: 'x', position: 'y' }), rules)).toBe(true);
  });

  it('그룹 롤 extraMenus에 있으면 규칙을 우회해 접근', () => {
    // /orders는 sales+manager만 허용이지만 extraMenus로 부여되면 통과
    expect(canAccessMenu('/orders', role({ department: 'hr', position: 'staff', extraMenus: ['/orders'] }), rules)).toBe(true);
  });

  it('규칙이 아예 없으면(fallback) 전체 접근', () => {
    expect(canAccessMenu('/orders', role({ department: 'hr', position: 'staff' }), undefined)).toBe(true);
  });

  it('해당 메뉴 규칙이 없으면 전체 접근', () => {
    expect(canAccessMenu('/no-rule-menu', role({ department: 'hr', position: 'staff' }), rules)).toBe(true);
  });

  it('부서 AND 직급 모두 맞아야 접근', () => {
    expect(canAccessMenu('/orders', role({ department: 'sales', position: 'manager' }), rules)).toBe(true);
    expect(canAccessMenu('/orders', role({ department: 'sales', position: 'staff' }), rules)).toBe(false); // 직급 불일치
    expect(canAccessMenu('/orders', role({ department: 'hr', position: 'manager' }), rules)).toBe(false); // 부서 불일치
  });

  it('빈 배열은 "전체 허용"을 의미', () => {
    // /inventory: 부서·직급 모두 빈 배열 → 누구나
    expect(canAccessMenu('/inventory', role({ department: 'hr', position: 'staff' }), rules)).toBe(true);
    // /quotations: 부서만 sales 제한, 직급은 전체
    expect(canAccessMenu('/quotations', role({ department: 'sales', position: 'staff' }), rules)).toBe(true);
    expect(canAccessMenu('/quotations', role({ department: 'hr', position: 'manager' }), rules)).toBe(false);
  });

  it('superAdminMinLevel 커스텀 임계값이 반영된다', () => {
    // 임계값을 5로 낮추면 level 5도 마스터
    expect(canAccessMenu('/orders', role({ department: 'hr', position: 'x', positionLevel: 5 }), rules, 5)).toBe(true);
    expect(canAccessMenu('/orders', role({ department: 'hr', position: 'x', positionLevel: 4 }), rules, 5)).toBe(false);
  });
});

describe('isSuperAdmin', () => {
  it('positionLevel이 임계값 이상이면 true', () => {
    expect(isSuperAdmin(role({ positionLevel: 7 }))).toBe(true);
    expect(isSuperAdmin(role({ positionLevel: 6 }))).toBe(false);
  });

  it('positionLevel이 없으면 director만 마스터(하위호환)', () => {
    expect(isSuperAdmin(role({ position: 'director' }))).toBe(true);
    expect(isSuperAdmin(role({ position: 'staff' }))).toBe(false);
  });
});

describe('parseRole', () => {
  it('메타데이터가 없으면 기본 역할', () => {
    expect(parseRole(undefined)).toEqual(DEFAULT_ROLE);
  });

  it('부서/직급을 그대로 파싱', () => {
    expect(parseRole({ department: 'sales', position: 'manager' })).toEqual({ department: 'sales', position: 'manager' });
  });

  it('valid 목록에 없는 값은 기본값으로 대체', () => {
    const parsed = parseRole({ department: 'ghost', position: 'manager' }, ['sales', 'hr'], ['manager', 'staff']);
    expect(parsed.department).toBe(DEFAULT_ROLE.department); // ghost는 무효 → 기본
    expect(parsed.position).toBe('manager'); // manager는 유효
  });
});
