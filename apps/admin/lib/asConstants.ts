export type AsStatus = 'received' | 'inspecting' | 'repairing' | 'completed' | 'returned';

export const AS_STATUS_LABEL: Record<AsStatus, string> = {
  received: '접수',
  inspecting: '검수중',
  repairing: '수리중',
  completed: '수리완료',
  returned: '반납완료',
};

export const DEFECTIVE_PART_OPTIONS = [
  '전원 불량',
  '화면 불량',
  '버튼 불량',
  '케이스 파손',
  '충전 불량',
  '배터리 불량',
  '통신 오류',
  '소프트웨어 오류',
  '소음/진동',
  '냄새/발열',
  '부품 누락',
  '기타',
];
