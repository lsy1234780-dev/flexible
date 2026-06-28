'use client';

// 우측 하단 미니 채팅 위젯 (채널톡 스타일).
// 다른 업무 화면을 보면서 채팅을 병용. 공유 버튼으로 멘션하면 이 위젯이 떠서 바로 확인.
// 전체 채팅(/chat)과 메시지/작성 UI를 공유(ChatParts)한다.

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MessageCircle, X, Maximize2, ChevronDown, Hash, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useModuleEnabled } from '@/components/ModulesProvider';
import { useChatWidget } from '@/lib/chatWidgetStore';
import { MessageItem, Composer, type Message } from '@/components/chat/ChatParts';
import { entityHref } from '@/lib/entityLink';
import {
  getChannels, getMessages, sendMessage, markChannelRead, toggleReaction,
  editMessage, deleteMessage, getMyMentions,
} from '@/actions/chat';
import { getCurrentUser } from '@/actions/auth';

interface Ch { id: string; name: string; kind: string; partner_name?: string | null; unread?: number }
const chLabel = (c: Ch | undefined | null) => (!c ? '' : c.kind === 'dm' ? (c.partner_name ?? '다이렉트 메시지') : c.name);

export default function ChatWidget() {
  const chatEnabled = useModuleEnabled('chat');
  const pathname = usePathname();
  const router = useRouter();
  const { open, channelId, openWidget, closeWidget } = useChatWidget();

  const [me, setMe] = useState<{ id: string | null; name: string }>({ id: null, name: '나' });
  const [channels, setChannels] = useState<Ch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadMentions, setUnreadMentions] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const active = channels.find((c) => c.id === activeId) ?? null;

  const loadChannels = useCallback(async () => {
    const rows = (await getChannels()) as Ch[];
    setChannels(rows);
    return rows;
  }, []);
  const loadMessages = useCallback(async (id: string) => {
    setMessages((await getMessages(id) ?? []) as Message[]);
  }, []);
  const loadMentions = useCallback(async () => {
    try { setUnreadMentions((await getMyMentions()).filter((m) => m.is_unread).length); } catch { /* noop */ }
  }, []);

  // 최초: 나 + 멘션 배지 (닫혀 있어도 배지는 보여야 함)
  useEffect(() => {
    if (!chatEnabled) return;
    getCurrentUser().then((u) => u && setMe({ id: u.id, name: u.name }));
    loadMentions();
  }, [chatEnabled, loadMentions]);

  // 멘션/메시지 배지 realtime (위젯 닫혀 있어도 갱신)
  useEffect(() => {
    if (!chatEnabled) return;
    const supabase = createClient();
    const rt = supabase
      .channel('chat-widget-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        loadMentions();
        const row = (payload.new ?? payload.old) as { channel_id?: string } | null;
        if (open && activeId && row?.channel_id === activeId) { loadMessages(activeId); markChannelRead(activeId); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        if (open && activeId) loadMessages(activeId);
      })
      .subscribe();
    return () => { supabase.removeChannel(rt); };
  }, [chatEnabled, open, activeId, loadMentions, loadMessages]);

  // 위젯 열리면 채널 로드 + 활성 채널 결정 (store.channelId 우선 = 공유로 연 경우)
  useEffect(() => {
    if (!open) return;
    loadChannels().then((rows) => {
      setActiveId((prev) => channelId ?? prev ?? rows[0]?.id ?? null);
    });
  }, [open, channelId, loadChannels]);

  // 활성 채널 메시지 로드 + 읽음
  useEffect(() => {
    if (!open || !activeId) return;
    loadMessages(activeId);
    markChannelRead(activeId).then(loadMentions);
  }, [open, activeId, loadMessages, loadMentions]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function jump(type: string, id: string) {
    const href = entityHref(type, id);
    if (href && href !== '#') router.push(href);
  }
  async function handleSend(body: string, mentions: { entity_type: string; entity_id: string; label: string }[], attachments: import('@/actions/chat').AttachmentInput[]) {
    if (!activeId) return;
    const r = await sendMessage(activeId, body, mentions, null, attachments);
    if (r?.error) { toast.error(r.error); return; }
    loadMessages(activeId);
  }
  async function handleReact(id: string, emoji: string) {
    const r = await toggleReaction(id, emoji);
    if (r?.error) { toast.error(r.error); return; }
    if (activeId) loadMessages(activeId);
  }
  async function handleEdit(id: string, body: string): Promise<boolean> {
    const r = await editMessage(id, body);
    if (r?.error) { toast.error(r.error); return false; }
    if (activeId) loadMessages(activeId);
    return true;
  }
  async function handleDelete(id: string) {
    if (!confirm('이 메시지를 삭제할까요?')) return;
    const r = await deleteMessage(id);
    if (r?.error) { toast.error(r.error); return; }
    if (activeId) loadMessages(activeId);
  }

  // chat 모듈 꺼졌거나 채팅 전체화면(/chat)에서는 위젯 숨김
  if (!chatEnabled || pathname.startsWith('/chat')) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* 미니 패널 */}
      {open && (
        <div className="flex h-[70vh] max-h-[560px] w-[min(92vw,380px)] flex-col overflow-hidden rounded-xl border bg-white shadow-2xl">
          {/* 헤더 */}
          <div className="relative flex items-center gap-2 border-b px-3 h-12 bg-gray-50">
            <button
              onClick={() => setSwitcherOpen((v) => !v)}
              className="flex min-w-0 items-center gap-1 rounded px-1.5 py-1 hover:bg-gray-200"
            >
              {active?.kind === 'dm' ? <User size={14} className="text-gray-400" /> : <Hash size={14} className="text-gray-400" />}
              <span className="truncate text-sm font-semibold text-gray-800">{active ? chLabel(active) : '채널 선택'}</span>
              <ChevronDown size={13} className="text-gray-400" />
            </button>
            <div className="ml-auto flex items-center gap-0.5">
              <button onClick={() => router.push(activeId ? `/chat?channel=${activeId}` : '/chat')} className="p-1.5 text-gray-400 hover:text-gray-700" title="전체 화면">
                <Maximize2 size={15} />
              </button>
              <button onClick={closeWidget} className="p-1.5 text-gray-400 hover:text-gray-700" title="닫기">
                <X size={16} />
              </button>
            </div>

            {/* 채널 전환 드롭다운 */}
            {switcherOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSwitcherOpen(false)} />
                <div className="absolute left-2 top-12 z-20 max-h-72 w-60 overflow-y-auto rounded-lg border bg-white py-1 shadow-xl">
                  {channels.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setActiveId(c.id); setSwitcherOpen(false); }}
                      className={cn('flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm hover:bg-gray-100', activeId === c.id && 'bg-gray-100 font-semibold')}
                    >
                      {c.kind === 'dm' ? <User size={13} className="text-gray-400" /> : <Hash size={13} className="text-gray-400" />}
                      <span className="truncate flex-1">{chLabel(c)}</span>
                      {(c.unread ?? 0) > 0 && activeId !== c.id && (
                        <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{c.unread}</span>
                      )}
                    </button>
                  ))}
                  {channels.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">채널 없음</p>}
                </div>
              </>
            )}
          </div>

          {/* 메시지 */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                m={m}
                meId={me.id}
                meName={me.name}
                onReact={handleReact}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onJump={jump}
              />
            ))}
            {messages.length === 0 && activeId && <p className="pt-6 text-center text-sm text-gray-400">첫 메시지를 남겨보세요.</p>}
            {!activeId && <p className="pt-6 text-center text-sm text-gray-400">채널을 선택하세요.</p>}
            <div ref={bottomRef} />
          </div>

          {/* 작성 */}
          {activeId && (
            <Composer channelId={activeId} placeholder={`${chLabel(active)} 에 메시지…`} onSend={handleSend} />
          )}
        </div>
      )}

      {/* 플로팅 버튼 */}
      <button
        onClick={() => (open ? closeWidget() : openWidget())}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition-transform hover:scale-105"
        title="채팅"
      >
        {open ? <ChevronDown size={20} /> : <MessageCircle size={20} />}
        {!open && unreadMentions > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadMentions > 9 ? '9+' : unreadMentions}
          </span>
        )}
      </button>
    </div>
  );
}
