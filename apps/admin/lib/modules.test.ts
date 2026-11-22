import { describe, it, expect } from 'vitest';
import { moduleForPath, isMenuModuleEnabled } from './modules';

// 라우트 단위 모듈 게이팅(middleware)의 경로 판정 — 꺼진 모듈의 URL 직접 접근 차단에 쓰인다.

describe('moduleForPath', () => {
  it('메뉴 경로와 정확히 같으면 해당 모듈', () => {
    expect(moduleForPath('/deals')).toBe('crm_pipeline');
    expect(moduleForPath('/orders')).toBe('orders');
  });

  it('하위 경로(상세·작성 화면)도 같은 모듈', () => {
    expect(moduleForPath('/deals/123')).toBe('crm_pipeline');
    expect(moduleForPath('/quotations/new')).toBe('quotations');
    expect(moduleForPath('/expenses/finance')).toBe('expenses');
  });

  it('접두사만 겹치는 다른 경로는 오인하지 않음 (/as vs /attendance)', () => {
    expect(moduleForPath('/as')).toBe('service');
    expect(moduleForPath('/as/1')).toBe('service');
    expect(moduleForPath('/attendance')).toBe('attendance');
    expect(moduleForPath('/assets')).toBeNull();
  });

  it('코어·비매핑 경로는 게이팅하지 않음', () => {
    expect(moduleForPath('/settings')).toBeNull();
    expect(moduleForPath('/inbox')).toBeNull();
    expect(moduleForPath('/module-disabled')).toBeNull();
  });
});

describe('isMenuModuleEnabled', () => {
  it('켜진 모듈의 메뉴만 노출', () => {
    expect(isMenuModuleEnabled('/deals', ['crm_pipeline'])).toBe(true);
    expect(isMenuModuleEnabled('/deals', ['orders'])).toBe(false);
  });

  it('모듈 목록이 없으면 전부 노출(안전 fallback)', () => {
    expect(isMenuModuleEnabled('/deals', null)).toBe(true);
  });
});
