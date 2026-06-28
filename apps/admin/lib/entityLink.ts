// 엔티티 멘션 칩 클릭 → 해당 레코드 페이지로 점프 (양방향 링크의 "채팅→레코드" 방향)
export function entityHref(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'company':
      return `/companies/${entityId}`;
    case 'product':
      return `/products/${entityId}`;
    case 'order':
      return `/orders/${entityId}`;
    case 'as':
      return `/as/${entityId}`;
    case 'deal':
      return '/deals'; // 칸반 (딜 상세 라우트는 후속)
    case 'quotation':
      return '/quotations';
    case 'category':
      return '/categories';
    case 'warehouse':
      return '/warehouses';
    case 'receiving':
      return '/receiving';
    case 'user':
    default:
      return '#';
  }
}

// 멘션 칩 색상 (엔티티 종류별)
export function entityChipClass(entityType: string): string {
  switch (entityType) {
    case 'user':
      return 'bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200';
    case 'company':
      return 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200';
    case 'deal':
      return 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200';
    case 'product':
      return 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200';
    case 'category':
      return 'bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200';
    case 'order':
      return 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200';
    case 'quotation':
      return 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200';
    case 'warehouse':
      return 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border-cyan-200';
    case 'receiving':
      return 'bg-lime-50 text-lime-700 hover:bg-lime-100 border-lime-200';
    case 'as':
      return 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200';
    default:
      return 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200';
  }
}

export const ENTITY_LABEL: Record<string, string> = {
  user: '멤버',
  company: '거래처',
  deal: '딜',
  product: '제품',
  category: '카테고리',
  order: '수주',
  quotation: '견적',
  warehouse: '창고',
  receiving: '입고',
  as: 'A/S',
};
