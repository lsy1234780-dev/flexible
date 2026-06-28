import { create } from 'zustand';

// 우측 하단 미니 채팅 위젯의 전역 상태.
// 어디서든(특히 ShareToChat) 위젯을 특정 채널로 열 수 있게 한다.
interface ChatWidgetState {
  open: boolean;
  channelId: string | null;
  openWidget: (channelId?: string | null) => void;
  closeWidget: () => void;
  toggleWidget: () => void;
}

export const useChatWidget = create<ChatWidgetState>((set) => ({
  open: false,
  channelId: null,
  openWidget: (channelId = null) => set((s) => ({ open: true, channelId: channelId ?? s.channelId })),
  closeWidget: () => set({ open: false }),
  toggleWidget: () => set((s) => ({ open: !s.open })),
}));
