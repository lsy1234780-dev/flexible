// 입고 파이프라인 스테이지 설정
// DB에는 text로 저장, 스테이지 정의는 여기서만 관리
// 추후 사용자 확정 시 수정

// ── 운송 스테이지 (inbound_shipments.stage) ──
export const INBOUND_STAGES = [
  { key: 'in_transit', label: '운송중', color: 'bg-cyan-100 text-cyan-700' },
  { key: 'customs', label: '통관중', color: 'bg-purple-100 text-purple-700' },
  { key: 'customs_cleared', label: '통관완료', color: 'bg-violet-100 text-violet-700' },
  { key: 'domestic', label: '국내운송', color: 'bg-blue-100 text-blue-700' },
  { key: 'arrived', label: '입고대기', color: 'bg-amber-100 text-amber-700' },
  { key: 'completed', label: '입고완료', color: 'bg-green-100 text-green-700' },
] as const;

export type InboundStage = (typeof INBOUND_STAGES)[number]['key'];

export function getStageConfig(key: string) {
  return INBOUND_STAGES.find((s) => s.key === key) ?? INBOUND_STAGES[0];
}

export function getNextStage(currentKey: string): string | null {
  const idx = INBOUND_STAGES.findIndex((s) => s.key === currentKey);
  if (idx < 0 || idx >= INBOUND_STAGES.length - 1) return null;
  return INBOUND_STAGES[idx + 1].key;
}

// ── 운송 타입 ──
export const SHIPPING_TYPES = [
  { key: 'sea', label: '해상' },
  { key: 'air', label: '항공' },
  { key: 'domestic', label: '국내' },
] as const;

export function getShippingTypeLabel(key: string | null) {
  return SHIPPING_TYPES.find((t) => t.key === key)?.label ?? '-';
}

// ── 통관 상태 ──
export const CUSTOMS_STATUSES = [
  { key: 'pending', label: '대기' },
  { key: 'in_progress', label: '진행중' },
  { key: 'cleared', label: '완료' },
  { key: 'exempt', label: '면제' },
] as const;

export function getCustomsStatusLabel(key: string | null) {
  return CUSTOMS_STATUSES.find((s) => s.key === key)?.label ?? '-';
}
