import { create } from 'zustand';

// 글로벌 검색(Cmd/Ctrl+K) 팔레트의 전역 상태 — 사이드바 버튼, 키보드 단축키 등 어디서든 열 수 있게 한다.
interface GlobalSearchState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useGlobalSearch = create<GlobalSearchState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
