const LOCATION_TYPE_LABELS: Record<string, string> = {
  zone: '구역',
  aisle: '통로',
  rack: '랙',
  level: '층',
  bin: '칸',
};

const CHILD_TYPE: Record<string, string> = {
  zone: 'aisle',
  aisle: 'rack',
  rack: 'level',
  level: 'bin',
};

export function getLocationTypeLabel(type: string) {
  return LOCATION_TYPE_LABELS[type] || type;
}

export function getChildType(parentType: string | null): string | null {
  if (!parentType) return 'zone';
  return CHILD_TYPE[parentType] || null;
}
