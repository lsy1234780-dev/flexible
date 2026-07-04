'use client';

// 우측 하단 미니 채팅 위젯 (채널톡 스타일).
// 다른 업무 화면을 보면서 채팅을 병용. 공유 버튼으로 멘션하면 이 위젯이 떠서 바로 확인.
// 전체 채팅(/chat)과 메시지/작성 UI를 공유(ChatParts)한다.
//
// 답글(스레드): 메인 채팅은 그대로 두고, 왼쪽에 스레드 패널이 폭 트랜지션으로 슬라이드 열림
// (/chat의 사이드패널과 같은 구조 — 위젯이 좁아서 화면 전환하면 메인 대화가 끊겨 보이는 문제를 피함).

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
import { PresenceBadge, MyStatusControl } from '@/components/chat/Presence';
import { getPresenceMap, type PresenceMap } from '@/actions/presence';

interface Ch { id: string; name: string; kind: string; partner_id?: string | null; partner_name?: string | null; unread?: number }
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
  const [threadParent, setThreadParent] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadBottomRef = useRef<HTMLDivElement>(null);

  const active = channels.find((c) => c.id === activeId) ?? null;
  // 답글 스레드 (ChatClient와 동일한 flat 모델)
  const topLevel = messages.filter((m) => !m.reply_to);
  const replyCount = (parentId: string) => messages.filter((m) => m.reply_to === parentId).length;
  const threadMsg = threadParent ? messages.find((m) => m.id === threadParent) ?? null : null;
  const threadReplies = threadParent ? messages.filter((m) => m.reply_to === threadParent) : [];

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
    getPresenceMap().then(setPresence).catch(() => {});
  }, [open, channelId, loadChannels]);

  // 활성 채널 메시지 로드 + 읽음 (채널 전환 시 보던 스레드 패널은 닫음 — /chat과 동일 동작)
  useEffect(() => {
    if (!open || !activeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- activeId가 store(공유 버튼)로도 바뀔 수 있어 effect에서 처리하는 게 맞음
    setThreadParent(null);
    loadMessages(activeId);
    markChannelRead(activeId).then(loadMentions);
  }, [open, activeId, loadMessages, loadMentions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    threadBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function jump(type: string, id: string) {
    const href = entityHref(type, id);
    if (href && href !== '#') router.push(href);
  }
  // 메인 채팅 작성 — 항상 최상위 메시지 (스레드 패널이 옆에 열려 있어도 이건 채널에 바로 씀)
  async function handleSend(body: string, mentions: { entity_type: string; entity_id: string; label: string }[], attachments: import('@/actions/chat').AttachmentInput[]) {
    if (!activeId) return;
    const r = await sendMessage(activeId, body, mentions, null, attachments);
    if (r?.error) { toast.error(r.error); return; }
    loadMessages(activeId);
  }
  // 스레드 패널 작성 — 항상 그 스레드에 답글 (075/076 트리거가 부모의 레코드 멘션을 자동 상속)
  async function handleThreadSend(body: string, mentions: { entity_type: string; entity_id: string; label: string }[], attachments: import('@/actions/chat').AttachmentInput[]) {
    if (!activeId || !threadParent) return;
    const r = await sendMessage(activeId, body, mentions, threadParent, attachments);
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
        <div className="flex h-[70vh] max-h-[560px] max-w-[95vw] flex-row overflow-hidden rounded-xl border bg-white shadow-2xl">
          {/* 메인 채팅 컬럼 — /chat과 동일하게 왼쪽. 스레드 열리면 이 컬럼이 왼쪽으로 밀리며 확장 */}
          <div className="flex w-[min(92vw,380px)] flex-shrink-0 flex-col overflow-hidden">
            {/* 헤더 */}
            <div className="relative flex h-12 flex-shrink-0 items-center gap-2 border-b bg-gray-50 px-3">
              <button
                onClick={() => setSwitcherOpen((v) => !v)}
                className="flex min-w-0 items-center gap-1 rounded px-1.5 py-1 hover:bg-gray-200"
              >
                {active?.kind === 'dm' ? <User size={14} className="text-gray-400" /> : <Hash size={14} className="text-gray-400" />}
                <span className="truncate text-sm font-semibold text-gray-800">{active ? chLabel(active) : '채널 선택'}</span>
                {active?.kind === 'dm' && active.partner_id && (
                  <PresenceBadge info={presence[active.partner_id]} />
                )}
                <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
              </button>
              <div className="ml-auto flex items-center gap-1">
                <MyStatusControl onChanged={() => getPresenceMap().then(setPresence).catch(() => {})} />
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
                        {c.kind === 'dm' && c.partner_id && <PresenceBadge info={presence[c.partner_id]} />}
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

            {/* 최상위 메시지 목록 — 항상 이 컬럼에 유지, 답글 누르면 오른쪽에 패널이 열림 */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {topLevel.map((m) => (
                <MessageItem
                  key={m.id}
                  m={m}
                  meId={me.id}
                  meName={me.name}
                  onReact={handleReact}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onJump={jump}
                  onOpenThread={() => setThreadParent(m.id)}
                  replyCount={replyCount(m.id)}
                />
              ))}
              {topLevel.length === 0 && activeId && <p className="pt-6 text-center text-sm text-gray-400">첫 메시지를 남겨보세요.</p>}
              {!activeId && <p className="pt-6 text-center text-sm text-gray-400">채널을 선택하세요.</p>}
              <div ref={bottomRef} />
            </div>

            {/* 작성 */}
            {activeId && (
              <Composer channelId={activeId} placeholder={`${chLabel(active)} 에 메시지…`} onSend={handleSend} />
            )}
          </div>

          {/* 스레드 컬럼 — /chat과 동일하게 오른쪽. 폭 0↔320px 트랜지션으로 슬라이드 열림/닫힘 */}
          <div
            className={cn(
              'flex flex-shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out',
              threadMsg ? 'w-80 border-l' : 'w-0 border-l-0',
            )}
          >
            {threadMsg && (
              <>
                <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b bg-gray-50 px-3">
                  <span className="whitespace-nowrap text-sm font-semibold text-gray-800">답글</span>
                  <button onClick={() => setThreadParent(null)} className="ml-auto flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-700" title="스레드 닫기">
                    <X size={16} />
                  </button>
                </div>
                <div className="w-80 flex-1 overflow-y-auto px-3 py-3 space-y-3">
                  <MessageItem m={threadMsg} meId={me.id} meName={me.name} onReact={handleReact} onEdit={handleEdit} onDelete={handleDelete} onJump={jump} />
                  {threadReplies.length > 0 && (
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <span>{threadReplies.length}개 답글</span>
                      <div className="h-px flex-1 bg-gray-100" />
                    </div>
                  )}
                  {threadReplies.map((r) => (
                    <div key={r.id} className="border-l-2 border-gray-100 pl-3">
                      <MessageItem m={r} meId={me.id} meName={me.name} onReact={handleReact} onEdit={handleEdit} onDelete={handleDelete} onJump={jump} />
                    </div>
                  ))}
                  <div ref={threadBottomRef} />
                </div>
                <div className="w-80 flex-shrink-0">
                  <Composer channelId={activeId!} placeholder="답글 남기기…" onSend={handleThreadSend} />
                </div>
              </>
            )}
          </div>
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
