'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Plus, Hash, User, X, Bell, AtSign as AtSignIcon, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  getMessages, sendMessage, createChannel, getChannels,
  markChannelRead, toggleReaction, getWorkspaceMembers, startDirectMessage,
  editMessage, deleteMessage, getMyMentions,
  type MyMention, type AttachmentInput,
} from '@/actions/chat';
import { entityHref } from '@/lib/entityLink';
import { MessageItem, Composer, ContextPanel, type Message, type Mention, type QuotedMessage } from '@/components/chat/ChatParts';
import type { Channel } from './page';

interface Member { user_id: string; name: string; email: string; department: string | null }

interface Props {
  channels: Channel[];
  meId: string | null;
  meName: string;
  initialChannelId?: string | null;
}

const channelLabel = (c: Channel) => (c.kind === 'dm' ? (c.partner_name ?? '다이렉트 메시지') : c.name);

export default function ChatClient({ channels: initialChannels, meId, meName, initialChannelId }: Props) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [activeId, setActiveId] = useState<string | null>(
    (initialChannelId && initialChannels.some((c) => c.id === initialChannelId) ? initialChannelId : null)
      ?? initialChannels[0]?.id
      ?? null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadParent, setThreadParent] = useState<string | null>(null);
  const [mentions, setMentions] = useState<MyMention[]>([]);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [forwardState, setForwardState] = useState<{ msg: Message; coords: { left: number; top: number } } | null>(null);
  const [composerQuote, setComposerQuote] = useState<QuotedMessage | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMentions = useCallback(async () => {
    try { setMentions(await getMyMentions()); } catch { /* noop */ }
  }, []);
  const unreadMentions = mentions.filter((m) => m.is_unread).length;

  const active = channels.find((c) => c.id === activeId) ?? null;
  const publicChannels = channels.filter((c) => c.kind === 'channel');
  const dms = channels.filter((c) => c.kind === 'dm');

  const loadMessages = useCallback(async (channelId: string) => {
    const rows = await getMessages(channelId);
    setMessages((rows ?? []) as Message[]);
  }, []);

  const refreshChannels = useCallback(async () => {
    const rows = await getChannels();
    setChannels(rows as Channel[]);
  }, []);

  // 채널 열면: 메시지 로드 + 읽음 처리 + 로컬 안읽음 0
  useEffect(() => {
    if (!activeId) return;
    setThreadParent(null);
    loadMessages(activeId);
    markChannelRead(activeId).then(refreshChannels);
    setChannels((prev) => prev.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)));
  }, [activeId, loadMessages, refreshChannels]);

  // realtime: 워크스페이스의 메시지/반응 변경 구독 (RLS가 자동 필터)
  useEffect(() => {
    const supabase = createClient();
    const rt = supabase
      .channel('chat-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const row = (payload.new ?? payload.old) as { channel_id?: string } | null;
        if (activeId && row?.channel_id === activeId) {
          loadMessages(activeId);
          markChannelRead(activeId);
        } else {
          refreshChannels();
        }
        loadMentions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        if (activeId) loadMessages(activeId);
      })
      .subscribe();

    return () => { supabase.removeChannel(rt); };
  }, [activeId, loadMessages, refreshChannels, loadMentions]);

  // 멘션 알림 최초 로드
  useEffect(() => { loadMentions(); }, [loadMentions]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend(body: string, mentions: Mention[], attachments: AttachmentInput[], replyTo: string | null = null) {
    if (!activeId) return;
    const result = await sendMessage(activeId, body, mentions, replyTo, attachments);
    if (result?.error) { toast.error(result.error); return; }
    loadMessages(activeId);
  }

  function jump(entityType: string, entityId: string) {
    const href = entityHref(entityType, entityId);
    if (href && href !== '#') router.push(href);
  }

  async function handleReact(messageId: string, emoji: string) {
    const result = await toggleReaction(messageId, emoji);
    if (result?.error) { toast.error(result.error); return; }
    if (activeId) loadMessages(activeId);
  }

  async function handleEdit(messageId: string, body: string): Promise<boolean> {
    const result = await editMessage(messageId, body);
    if (result?.error) { toast.error(result.error); return false; }
    if (activeId) loadMessages(activeId);
    return true;
  }

  async function handleDelete(messageId: string) {
    if (!confirm('이 메시지를 삭제할까요?')) return;
    const result = await deleteMessage(messageId);
    if (result?.error) { toast.error(result.error); return; }
    if (activeId) loadMessages(activeId);
  }

  async function handleCreateChannel() {
    const name = prompt('새 채널 이름 (예: 영업팀)');
    if (!name) return;
    const result = await createChannel(name);
    if (result?.error) { toast.error(result.error); return; }
    await refreshChannels();
    if (result.id) setActiveId(result.id);
  }

  async function handleStartDM(userId: string) {
    const result = await startDirectMessage(userId);
    if (result?.error) { toast.error(result.error); return; }
    await refreshChannels();
    if (result.id) setActiveId(result.id);
  }

  function handleForwardClick(msg: Message, rect: DOMRect) {
    const dropLeft = Math.max(8, Math.min(rect.left, window.innerWidth - 272));
    const dropUp = rect.bottom + 360 > window.innerHeight;
    const dropTop = dropUp ? Math.max(8, rect.top - 364) : rect.bottom + 4;
    setForwardState({ msg, coords: { left: dropLeft, top: dropTop } });
  }

  async function handleForwardPick(userId: string) {
    if (!forwardState) return;
    const channelName = active?.name ?? active?.partner_name ?? '채널';
    const quote: QuotedMessage = {
      body: forwardState.msg.body,
      author: forwardState.msg.author_name ?? '사용자',
      channelName,
    };
    setForwardState(null);
    const result = await startDirectMessage(userId);
    if (result?.error) { toast.error(result.error); return; }
    await refreshChannels();
    if (result.id) setActiveId(result.id);
    setComposerQuote(quote);
  }

  const topLevel = messages.filter((m) => !m.reply_to);
  const replyCount = (parentId: string) => messages.filter((m) => m.reply_to === parentId).length;
  const threadMsg = threadParent ? messages.find((m) => m.id === threadParent) ?? null : null;
  const threadReplies = threadParent ? messages.filter((m) => m.reply_to === threadParent) : [];

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-4 md:-m-6">
      {/* 사이드바 */}
      <aside className="w-56 flex-shrink-0 border-r bg-gray-50 flex flex-col">
        {/* 상단: 멘션 알림 */}
        <div className="relative flex items-center justify-between border-b px-3 h-11">
          <span className="text-sm font-bold text-gray-800">메시지</span>
          <button
            onClick={() => setMentionsOpen((v) => !v)}
            className={cn('relative p-1 rounded transition-colors', mentionsOpen ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-700')}
            title="나를 멘션한 메시지"
          >
            <Bell size={16} />
            {unreadMentions > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
                {unreadMentions > 9 ? '9+' : unreadMentions}
              </span>
            )}
          </button>
          {mentionsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMentionsOpen(false)} />
              <div className="absolute right-2 top-10 z-20 w-72 rounded-lg border bg-white shadow-xl">
                <div className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold text-gray-600">
                  <AtSignIcon size={13} /> 나를 멘션
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {mentions.length === 0 && <p className="px-3 py-4 text-xs text-gray-400">멘션이 없습니다</p>}
                  {mentions.map((mn) => (
                    <button
                      key={mn.message_id}
                      onClick={() => { if (mn.channel_id) setActiveId(mn.channel_id); setMentionsOpen(false); }}
                      className={cn('block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-gray-50', mn.is_unread && 'bg-blue-50/50')}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        {mn.channel_kind === 'dm' ? <User size={11} /> : <Hash size={11} />}
                        <span className="truncate">{mn.channel_kind === 'dm' ? 'DM' : (mn.channel_name ?? '채널')}</span>
                        <span>·</span>
                        <span className="truncate">{mn.author_name ?? '사용자'}</span>
                        <span className="ml-auto flex-shrink-0">{dayjs(mn.created_at).format('MM.DD HH:mm')}</span>
                      </div>
                      {mn.body && <p className="mt-0.5 line-clamp-2 text-sm text-gray-700">{mn.body}</p>}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* 채널 */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">채널</span>
              <button onClick={handleCreateChannel} className="p-0.5 text-gray-400 hover:text-gray-700" title="채널 추가">
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-0.5">
              {publicChannels.map((c) => (
                <ChannelRow key={c.id} c={c} active={activeId === c.id} onClick={() => setActiveId(c.id)} icon={<Hash size={14} className="flex-shrink-0 opacity-60" />} />
              ))}
              {publicChannels.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">채널 없음</p>}
            </div>
          </div>

          {/* 다이렉트 메시지 */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">다이렉트 메시지</span>
              <MemberPicker onPick={handleStartDM} />
            </div>
            <div className="space-y-0.5">
              {dms.map((c) => (
                <ChannelRow key={c.id} c={c} active={activeId === c.id} onClick={() => setActiveId(c.id)} icon={<User size={14} className="flex-shrink-0 opacity-60" />} />
              ))}
              {dms.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">대화 없음</p>}
            </div>
          </div>
        </div>
      </aside>

      {/* 메시지 영역 */}
      <section className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 px-4 h-12 border-b">
          {active?.kind === 'dm' ? <User size={16} className="text-gray-400" /> : <Hash size={16} className="text-gray-400" />}
          <span className="font-semibold text-gray-900">{active ? channelLabel(active) : '채널 선택'}</span>
          <button
            onClick={() => { setContextOpen((v) => !v); setThreadParent(null); }}
            className={cn('ml-auto p-1.5 rounded transition-colors', contextOpen ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}
            title="이 대화의 맥락"
          >
            <PanelRight size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {topLevel.map((m) => (
            <MessageItem
              key={m.id}
              m={m}
              meId={meId}
              meName={meName}
              onReact={handleReact}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onOpenThread={() => { setThreadParent(m.id); setContextOpen(false); }}
              onJump={jump}
              onForward={active?.kind === 'channel' ? handleForwardClick : undefined}
              replyCount={replyCount(m.id)}
            />
          ))}
          {topLevel.length === 0 && activeId && (
            <p className="text-center text-sm text-gray-400 pt-8">첫 메시지를 남겨보세요.</p>
          )}
          <div ref={bottomRef} />
        </div>

        {activeId && (
          <Composer
            channelId={activeId}
            placeholder={active?.kind === 'dm' ? `${channelLabel(active)} 에게 메시지…` : `#${active ? channelLabel(active) : ''} 에 메시지…`}
            onSend={(body, mentions, attachments) => handleSend(body, mentions, attachments, null)}
            quotedMessage={composerQuote}
            onDismissQuote={() => setComposerQuote(null)}
          />
        )}
      </section>

      {/* DM 전달 멤버 피커 */}
      {forwardState && (
        <ForwardMemberPicker
          coords={forwardState.coords}
          onPick={handleForwardPick}
          onClose={() => setForwardState(null)}
        />
      )}

      {/* 맥락 패널 */}
      {contextOpen && !threadMsg && (
        <ContextPanel
          messages={messages}
          onClose={() => setContextOpen(false)}
        />
      )}

      {/* 스레드 패널 — 폭 0↔384px 트랜지션으로 슬라이드 열림/닫힘 (사이드바/본문은 그대로 고정) */}
      <aside
        className={cn(
          'flex-shrink-0 overflow-hidden bg-white flex flex-col transition-[width] duration-200 ease-out',
          threadMsg ? 'w-96 border-l' : 'w-0 border-l-0',
        )}
      >
        {threadMsg && (
          <>
            <div className="flex w-96 items-center justify-between px-4 h-12 border-b flex-shrink-0">
              <span className="text-sm font-semibold text-gray-700">스레드</span>
              <button onClick={() => setThreadParent(null)} className="p-1 text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>
            <div className="w-96 flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <MessageItem m={threadMsg} meId={meId} meName={meName} onReact={handleReact} onEdit={handleEdit} onDelete={handleDelete} onJump={jump} />
              {threadReplies.length > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                  <span>{threadReplies.length}개 답글</span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>
              )}
              {threadReplies.map((r) => (
                <div key={r.id} className="pl-3 border-l-2 border-gray-100">
                  <MessageItem m={r} meId={meId} meName={meName} onReact={handleReact} onEdit={handleEdit} onDelete={handleDelete} onJump={jump} />
                </div>
              ))}
            </div>
            <div className="w-96 flex-shrink-0">
              <Composer channelId={activeId!} placeholder="답글 남기기…" onSend={(body, mentions, attachments) => handleSend(body, mentions, attachments, threadMsg.id)} />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ─── DM 전달용 멤버 피커 (portal, fixed 좌표) ───
function ForwardMemberPicker({ coords, onPick, onClose }: {
  coords: { left: number; top: number };
  onPick: (userId: string) => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    getWorkspaceMembers().then((m) => { setMembers(m as Member[]); setLoaded(true); });
  }, []);

  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? members.filter((m) =>
        m.name.toLowerCase().includes(ql) ||
        m.email.toLowerCase().includes(ql) ||
        (m.department ?? '').toLowerCase().includes(ql))
    : members;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-64 rounded-lg border bg-white py-1 shadow-xl"
        style={{ left: coords.left, top: coords.top }}
      >
        <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-gray-400">DM으로 전달할 멤버 선택</p>
        <div className="px-2 pb-1.5">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·소속 검색…"
            className="w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div className="max-h-60 overflow-y-auto">
          {filtered.map((m) => (
            <button
              key={m.user_id}
              onClick={() => onPick(m.user_id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-medium text-blue-600">
                {m.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-800">{m.name}</span>
                <span className="block truncate text-[11px] text-gray-400">{m.department ?? '소속 없음'}</span>
              </span>
            </button>
          ))}
          {loaded && filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">{q ? '검색 결과 없음' : '전달할 멤버가 없습니다'}</p>
          )}
          {!loaded && <p className="px-3 py-2 text-xs text-gray-400">불러오는 중…</p>}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── 채널/DM 한 줄 ───
function ChannelRow({ c, active, onClick, icon }: { c: Channel; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  const unread = c.unread ?? 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors',
        active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-200',
        !active && unread > 0 && 'font-semibold text-gray-900',
      )}
    >
      {icon}
      <span className="truncate flex-1 text-left">{channelLabel(c)}</span>
      {!active && unread > 0 && (
        <span className="flex-shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

// ─── DM 시작용 멤버 피커 (검색 + 소속 표시) ───
// 드롭다운은 사이드바 overflow에 짤리지 않도록 portal로 body에 fixed 렌더.
function MemberPicker({ onPick }: { onPick: (userId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    getWorkspaceMembers().then((m) => { setMembers(m as Member[]); setLoaded(true); });
  }, [open, loaded]);

  function toggle() {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) {
        const left = Math.max(8, Math.min(r.left, window.innerWidth - 264));
        const dropUp = r.bottom + 340 > window.innerHeight;
        const top = dropUp ? Math.max(8, r.top - 344) : r.bottom + 4;
        setCoords({ left, top });
      }
    }
    setOpen((v) => !v);
  }

  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? members.filter((m) =>
        m.name.toLowerCase().includes(ql) ||
        m.email.toLowerCase().includes(ql) ||
        (m.department ?? '').toLowerCase().includes(ql))
    : members;

  return (
    <>
      <button ref={btnRef} onClick={toggle} className="p-0.5 text-gray-400 hover:text-gray-700" title="새 메시지">
        <Plus size={14} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[61] w-64 rounded-lg border bg-white py-1 shadow-xl"
            style={{ left: coords.left, top: coords.top }}
          >
            <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-gray-400">멤버 선택</p>
            <div className="px-2 pb-1.5">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="이름·소속 검색…"
                className="w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filtered.map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => { onPick(m.user_id); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100"
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-medium text-gray-600">
                    {m.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-800">{m.name}</span>
                    <span className="block truncate text-[11px] text-gray-400">{m.department ?? '소속 없음'}</span>
                  </span>
                </button>
              ))}
              {loaded && filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">{q ? '검색 결과 없음' : '다른 멤버가 없습니다'}</p>
              )}
              {!loaded && <p className="px-3 py-2 text-xs text-gray-400">불러오는 중…</p>}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

