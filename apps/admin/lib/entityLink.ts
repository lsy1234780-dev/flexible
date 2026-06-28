// 엔티티 멘션 칩 클릭 → 해당 레코드 페이지로 점프 (양방향 링크의 "채팅→레코드" 방향)
export function entityHref(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'company':
      return `/companies/${entityId}`;
    case 'product':
      return `/products/${entityId}`;
    case 'order':
      return `/orders/${entityId}`;
    case 'deal':
      return `/deals`; // 칸반 (딜 상세 라우트는 후속)
    default:
      return '#';
  }
}

// 멘션 칩 색상 (엔티티 종류별)
export function entityChipClass(entityType: string): string {
  switch (entityType) {
    case 'company':
      return 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200';
    case 'deal':
      return 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200';
    case 'product':
      return 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200';
    case 'order':
      return 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200';
    default:
      return 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200';
  }
}

export const ENTITY_LABEL: Record<string, string> = {
  company: '거래처',
  deal: '딜',
  product: '제품',
  order: '수주',
};
