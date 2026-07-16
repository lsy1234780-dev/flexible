'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Plus, Hash, User, X, Bell, BellOff, AtSign as AtSignIcon, PanelRight, Search as SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  getMessagesPage, getMessageById, getMessagesSince, sendMessage, createChannel, getChannels,
  markChannelRead, toggleReaction, getWorkspaceMembers, startDirectMessage,
  getMyMentions, searchMessages, setChannelMuted,
  type MyMention, type AttachmentInput, type MessageSearchResult,
} from '@/actions/chat';
import PushToggle from '@/components/chat/PushToggle';
import DndControl from '@/components/chat/DndControl';
import { entityHref } from '@/lib/entityLink';
import { MessageItem, Composer, ContextPanel, type Message, type Mention, type QuotedMessage } from '@/components/chat/ChatParts';
import { PresenceBadge, MyStatusControl } from '@/components/chat/Presence';
import { getPresenceMap, type PresenceMap, type PresenceInfo } from '@/actions/presence';
import type { Channel } from './page';

interface Member { user_id: string; name: string; email: string; department: string | null }

interface Props {
  channels: Channel[];
  meId: string | null;
  meName: string;
  initialChannelId?: string | null;
  workspaceId?: string | null;
}

const channelLabel = (c: Channel) => (c.kind === 'dm' ? (c.partner_name ?? '다이렉트 메시지') : c.name);

export default function ChatClient({ channels: initialChannels, meId, meName, initialChannelId, workspaceId }: Props) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [activeId, setActiveId] = useState<string | null>(
    (initialChannelId && initialChannels.some((c) => c.id === initialChannelId) ? initialChannelId : null)
      ?? initialChannels[0]?.id
      ?? null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [threadParent, setThreadParent] = useState<string | null>(null);
  const [mentions, setMentions] = useState<MyMention[]>([]);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [forwardState, setForwardState] = useState<{ msg: Message; coords: { left: number; top: number } } | null>(null);
  const [composerQuote, setComposerQuote] = useState<QuotedMessage | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceMap>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  // 스크롤 의도: initial=맨 아래로, append=바닥 근처였으면 따라가기, prepend=보던 위치 유지
  const scrollIntentRef = useRef<'initial' | 'append' | 'prepend' | null>(null);
  const prependAnchorRef = useRef(0);     // prepend 직전 (scrollHeight - scrollTop)
  const stickToBottomRef = useRef(true);  // append 시 바닥에 붙어 있었는지
  const loadingOlderRef = useRef(false);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const lastMessageAtRef = useRef<string | null>(null); // 재연결 백필 기준점
  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((m) => m.id));
    lastMessageAtRef.current = messages.length > 0 ? messages[messages.length - 1].created_at : null;
  }, [messages]);

  // 부재 표시 (휴가 자동 + 본인 설정 상태) — 자주 안 바뀌므로 진입 시 1회
  const loadPresence = useCallback(() => {
    getPresenceMap().then(setPresence).catch(() => {});
  }, []);
  useEffect(() => { loadPresence(); }, [loadPresence]);

  const loadMentions = useCallback(async () => {
    try { setMentions(await getMyMentions()); } catch { /* noop */ }
  }, []);
  const unreadMentions = mentions.filter((m) => m.is_unread).length;

  const active = channels.find((c) => c.id === activeId) ?? null;
  const publicChannels = channels.filter((c) => c.kind === 'channel');
  const dms = channels.filter((c) => c.kind === 'dm');

  const refreshChannels = useCallback(async () => {
    const rows = await getChannels();
    setChannels(rows as Channel[]);
  }, []);

  // 사이드바(채널 목록+멘션) 갱신 — 메시지 폭주 시에도 묶어서 한 번만 (디바운스)
  const sidebarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSidebarDebounced = useCallback(() => {
    if (sidebarTimer.current) clearTimeout(sidebarTimer.current);
    sidebarTimer.current = setTimeout(() => { refreshChannels(); loadMentions(); }, 700);
  }, [refreshChannels, loadMentions]);
  useEffect(() => () => { if (sidebarTimer.current) clearTimeout(sidebarTimer.current); }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }, []);

  // 단건 upsert(있으면 교체, 없으면 append) — realtime·본인 액션 공용. id로 중복 제거.
  const upsertMessage = useCallback((row: Message, opts?: { forceScroll?: boolean }) => {
    const isNew = !messageIdsRef.current.has(row.id);
    if (isNew) {
      stickToBottomRef.current = opts?.forceScroll || isNearBottom();
      scrollIntentRef.current = 'append';
    }
    setMessages((prev) => {
      const i = prev.findIndex((m) => m.id === row.id);
      if (i >= 0) { const next = [...prev]; next[i] = row; return next; }
      return [...prev, row];
    });
  }, [isNearBottom]);

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // realtime 이벤트 → 그 메시지 한 건만 다시 그림 (기존: 채널 100개 전체 재조회 → 제거)
  const patchMessage = useCallback(async (id: string, opts?: { forceScroll?: boolean }) => {
    try {
      const row = await getMessageById(id);
      if (row) upsertMessage(row as unknown as Message, opts);
      else removeMessage(id); // 삭제됨
    } catch { /* noop */ }
  }, [upsertMessage, removeMessage]);

  const loadInitial = useCallback(async (channelId: string) => {
    const page = await getMessagesPage(channelId);
    scrollIntentRef.current = 'initial';
    setMessages(page.messages as unknown as Message[]);
    setHasMore(page.hasMore);
  }, []);

  // 위로 스크롤 → 이전 페이지 이어붙이기 (보던 위치 유지)
  const loadOlder = useCallback(async () => {
    const el = scrollRef.current;
    const oldest = messages[0]?.created_at;
    if (!activeId || !el || !oldest || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    try {
      const page = await getMessagesPage(activeId, oldest);
      prependAnchorRef.current = el.scrollHeight - el.scrollTop;
      scrollIntentRef.current = 'prepend';
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...(page.messages as unknown as Message[]).filter((m) => !seen.has(m.id)), ...prev];
      });
      setHasMore(page.hasMore);
    } finally {
      loadingOlderRef.current = false;
    }
  }, [activeId, messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (el && el.scrollTop < 80 && hasMore && !loadingOlderRef.current) loadOlder();
  }

  // 재연결 백필 — 끊긴 사이의 신규 메시지만 이어붙임 (보던 위치·불러온 과거 대화는 리셋하지 않음).
  // 너무 많이 놓쳤으면(100개+) 그때만 최신 페이지로 리셋.
  const backfillMissed = useCallback(async (channelId: string) => {
    const after = lastMessageAtRef.current;
    if (!after) { loadInitial(channelId); return; }
    try {
      const rows = await getMessagesSince(channelId, after);
      if (rows.length >= 100) { loadInitial(channelId); return; }
      for (const r of rows) upsertMessage(r as unknown as Message);
    } catch { /* noop — 다음 이벤트에서 복구 */ }
  }, [loadInitial, upsertMessage]);

  // 채널 열면: 첫 페이지 로드 + 읽음 처리 + 로컬 안읽음 0
  useEffect(() => {
    if (!activeId) return;
    setThreadParent(null);
    loadInitial(activeId);
    markChannelRead(activeId).then(refreshChannels);
    setChannels((prev) => prev.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)));
  }, [activeId, loadInitial, refreshChannels]);

  // realtime: 활성 채널은 단건 반영(필터 구독), 다른 채널은 사이드바만 디바운스 갱신
  useEffect(() => {
    const supabase = createClient();
    let lost = false; // 연결이 끊겼다 붙으면 놓친 메시지를 백필

    const rt = supabase.channel(`chat-rt-${activeId ?? 'none'}`);
    if (activeId) {
      rt.on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const id = (payload.new as { id?: string })?.id;
          if (id) { patchMessage(id); markChannelRead(activeId); }
        })
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeId}` },
          (payload) => {
            const id = (payload.new as { id?: string })?.id;
            if (id) patchMessage(id); // 수정이면 교체, 소프트삭제면 제거
          });
    }
    rt.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as { channel_id?: string } | null;
        if (!activeId || row?.channel_id !== activeId) refreshSidebarDebounced();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
        // replica identity full(095) 덕에 DELETE 페이로드에도 message_id가 있다
        const mid = ((payload.new ?? payload.old) as { message_id?: string } | null)?.message_id;
        if (mid && messageIdsRef.current.has(mid)) patchMessage(mid);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && lost) {
          lost = false;
          if (activeId) backfillMissed(activeId); // 놓친 것만 이어붙임 — 화면 리셋 없음
          refreshSidebarDebounced();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          lost = true;
        }
      });

    return () => { supabase.removeChannel(rt); };
  }, [activeId, patchMessage, refreshSidebarDebounced, backfillMissed]);

  // 멘션 알림 최초 로드
  useEffect(() => { loadMentions(); }, [loadMentions]);

  // ─── presence(온라인) + 타이핑 인디케이터 — 워크스페이스 단일 realtime 채널, DB 안 거침 ───
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, { name: string; channelId: string; at: number }>>({});
  const presenceRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    if (!workspaceId || !meId) return;
    const supabase = createClient();
    const ch = supabase.channel(`ws-presence-${workspaceId}`, { config: { presence: { key: meId } } });
    presenceRef.current = ch;
    ch.on('presence', { event: 'sync' }, () => {
      setOnlineIds(new Set(Object.keys(ch.presenceState())));
    })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { channelId?: string; userId?: string; name?: string };
        if (!p.userId || !p.channelId || p.userId === meId) return;
        setTyping((prev) => ({ ...prev, [p.userId!]: { name: p.name ?? '누군가', channelId: p.channelId!, at: Date.now() } }));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') ch.track({ at: new Date().toISOString() });
      });
    return () => { presenceRef.current = null; supabase.removeChannel(ch); };
  }, [workspaceId, meId]);

  // 타이핑 표시 만료 청소 (3초)
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const t = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const entries = Object.entries(prev).filter(([, v]) => now - v.at < 3000);
        return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typing]);

  // 입력 중 브로드캐스트 (1.5초 스로틀)
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (!activeId || !meId || now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    presenceRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { channelId: activeId, userId: meId, name: meName },
    });
  }, [activeId, meId, meName]);

  const typingNames = Object.values(typing)
    .filter((t) => t.channelId === activeId && Date.now() - t.at < 3000)
    .map((t) => t.name);

  // ─── 메시지 검색 (300ms 디바운스, 2자 이상) ───
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<MessageSearchResult[] | null>(null);
  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults(null); return; }
    const t = setTimeout(() => {
      searchMessages(q).then(setSearchResults).catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  // 스크롤 반영 — 의도별 (항상 바닥으로 끌어내리던 기존 동작은 무한 스크롤과 충돌)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const intent = scrollIntentRef.current;
    scrollIntentRef.current = null;
    if (!el || !intent) return;
    if (intent === 'initial') el.scrollTop = el.scrollHeight;
    else if (intent === 'append' && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    else if (intent === 'prepend') el.scrollTop = el.scrollHeight - prependAnchorRef.current;
  }, [messages]);

  async function handleSend(body: string, mentions: Mention[], attachments: AttachmentInput[], replyTo: string | null = null) {
    if (!activeId) return;
    const result = await sendMessage(activeId, body, mentions, replyTo, attachments);
    if (result?.error) { toast.error(result.error); return; }
    if (result.id) patchMessage(result.id, { forceScroll: true }); // realtime과 겹쳐도 upsert가 중복 제거
  }

  function jump(entityType: string, entityId: string) {
    const href = entityHref(entityType, entityId);
    if (href && href !== '#') router.push(href);
  }

  async function handleReact(messageId: string, emoji: string) {
    const result = await toggleReaction(messageId, emoji);
    if (result?.error) { toast.error(result.error); return; }
    patchMessage(messageId);
  }

  async function handleToggleMute() {
    if (!active) return;
    const next = !active.muted;
    const res = await setChannelMuted(active.id, next);
    if (res?.error) { toast.error(res.error); return; }
    setChannels((prev) => prev.map((c) => (c.id === active.id ? { ...c, muted: next } : c)));
    toast.success(next ? '이 채널 알림을 껐습니다' : '이 채널 알림을 다시 받습니다');
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
  const authorPresence = (m: Message) => (m.author_id ? presence[m.author_id] ?? null : null);
  const threadMsg = threadParent ? messages.find((m) => m.id === threadParent) ?? null : null;
  const threadReplies = threadParent ? messages.filter((m) => m.reply_to === threadParent) : [];

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-4 md:-m-6">
      {/* 사이드바 */}
      <aside className="w-56 flex-shrink-0 border-r bg-gray-50 flex flex-col">
        {/* 상단: 멘션 알림 */}
        <div className="relative flex items-center justify-between border-b px-3 h-11">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-bold text-gray-800">메시지</span>
            <MyStatusControl onChanged={loadPresence} />
            <PushToggle />
            <DndControl />
          </span>
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
        {/* 메시지 검색 */}
        <div className="border-b p-2">
          <div className="flex items-center gap-1.5 rounded-md border bg-white px-2 py-1.5">
            <SearchIcon size={13} className="flex-shrink-0 text-gray-400" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="메시지 검색"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
            {searchQ && (
              <button onClick={() => setSearchQ('')} className="flex-shrink-0 text-gray-400 hover:text-gray-700">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* 검색 결과 (2자 이상 입력 시 채널 목록 대신 표시) */}
          {searchResults !== null && (
            <div>
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                검색 결과 {searchResults.length}
              </p>
              <div className="space-y-0.5">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setActiveId(r.channel_id); setSearchQ(''); }}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-gray-200"
                  >
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      {r.channel_kind === 'dm' ? <User size={11} /> : <Hash size={11} />}
                      <span className="truncate">{r.channel_kind === 'dm' ? 'DM' : (r.channel_name ?? '채널')}</span>
                      <span>·</span>
                      <span className="truncate">{r.author_name ?? '사용자'}</span>
                      <span className="ml-auto flex-shrink-0">{dayjs(r.created_at).format('MM.DD')}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-sm text-gray-700">{r.body}</span>
                  </button>
                ))}
                {searchResults.length === 0 && <p className="px-2 py-3 text-xs text-gray-400">결과 없음</p>}
              </div>
            </div>
          )}
          {searchResults === null && (<>
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
              <MemberPicker onPick={handleStartDM} presence={presence} />
            </div>
            <div className="space-y-0.5">
              {dms.map((c) => (
                <ChannelRow
                  key={c.id} c={c} active={activeId === c.id} onClick={() => setActiveId(c.id)}
                  icon={<User size={14} className="flex-shrink-0 opacity-60" />}
                  badge={c.partner_id ? presence[c.partner_id] : null}
                  online={c.partner_id ? onlineIds.has(c.partner_id) : false}
                />
              ))}
              {dms.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">대화 없음</p>}
            </div>
          </div>
          </>)}
        </div>
      </aside>

      {/* 메시지 영역 */}
      <section className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 px-4 h-12 border-b">
          {active?.kind === 'dm' ? <User size={16} className="text-gray-400" /> : <Hash size={16} className="text-gray-400" />}
          <span className="font-semibold text-gray-900">{active ? channelLabel(active) : '채널 선택'}</span>
          {active?.kind === 'dm' && active.partner_id && (
            <>
              {onlineIds.has(active.partner_id) && (
                <span className="h-2 w-2 rounded-full bg-emerald-500" title="온라인" />
              )}
              <PresenceBadge info={presence[active.partner_id]} />
            </>
          )}
          {active && (
            <button
              onClick={handleToggleMute}
              className={cn('ml-auto p-1.5 rounded transition-colors', active.muted ? 'text-violet-600 hover:text-violet-700' : 'text-gray-400 hover:text-gray-700')}
              title={active.muted ? '이 채널 알림 꺼짐 — 클릭해서 켜기' : '이 채널 알림 끄기'}
            >
              {active.muted ? <BellOff size={15} /> : <Bell size={15} />}
            </button>
          )}
          <button
            onClick={() => { setContextOpen((v) => !v); setThreadParent(null); }}
            className={cn('p-1.5 rounded transition-colors', !active && 'ml-auto', contextOpen ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}
            title="이 대화의 맥락"
          >
            <PanelRight size={15} />
          </button>
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {hasMore && (
            <p className="py-1 text-center text-[11px] text-gray-300">↑ 위로 스크롤하면 이전 메시지를 불러옵니다</p>
          )}
          {topLevel.map((m) => (
            <MessageItem
              key={m.id}
              m={m}
              meId={meId}
              meName={meName}
              onReact={handleReact}
              onOpenThread={() => { setThreadParent(m.id); setContextOpen(false); }}
              onJump={jump}
              onForward={active?.kind === 'channel' ? handleForwardClick : undefined}
              replyCount={replyCount(m.id)}
              presence={authorPresence(m)}
            />
          ))}
          {topLevel.length === 0 && activeId && (
            <p className="text-center text-sm text-gray-400 pt-8">첫 메시지를 남겨보세요.</p>
          )}
        </div>

        {typingNames.length > 0 && (
          <p className="px-4 pb-0.5 text-[11px] text-gray-400">
            {typingNames.join(', ')} 입력 중<span className="animate-pulse">…</span>
          </p>
        )}
        {activeId && (
          <Composer
            channelId={activeId}
            placeholder={active?.kind === 'dm' ? `${channelLabel(active)} 에게 메시지…` : `#${active ? channelLabel(active) : ''} 에 메시지…`}
            onSend={(body, mentions, attachments) => handleSend(body, mentions, attachments, null)}
            quotedMessage={composerQuote}
            onDismissQuote={() => setComposerQuote(null)}
            onTyping={sendTyping}
          />
        )}
      </section>

      {/* DM 전달 멤버 피커 */}
      {forwardState && (
        <ForwardMemberPicker
          coords={forwardState.coords}
          onPick={handleForwardPick}
          onClose={() => setForwardState(null)}
          presence={presence}
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
              <MessageItem m={threadMsg} meId={meId} meName={meName} onReact={handleReact} onJump={jump} presence={authorPresence(threadMsg)} />
              {threadReplies.length > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                  <span>{threadReplies.length}개 답글</span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>
              )}
              {threadReplies.map((r) => (
                <div key={r.id} className="pl-3 border-l-2 border-gray-100">
                  <MessageItem m={r} meId={meId} meName={meName} onReact={handleReact} onJump={jump} presence={authorPresence(r)} />
                </div>
              ))}
            </div>
            <div className="w-96 flex-shrink-0">
              <Composer channelId={activeId!} placeholder="답글 남기기…" onSend={(body, mentions, attachments) => handleSend(body, mentions, attachments, threadMsg.id)} onTyping={sendTyping} />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ─── DM 전달용 멤버 피커 (portal, fixed 좌표) ───
function ForwardMemberPicker({ coords, onPick, onClose, presence }: {
  coords: { left: number; top: number };
  onPick: (userId: string) => void;
  onClose: () => void;
  presence: PresenceMap;
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
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate text-sm text-gray-800">{m.name}</span>
                  <PresenceBadge info={presence[m.user_id]} />
                </span>
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
function ChannelRow({ c, active, onClick, icon, badge, online }: {
  c: Channel; active: boolean; onClick: () => void; icon: React.ReactNode; badge?: PresenceInfo | null; online?: boolean;
}) {
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
      {online && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" title="온라인" />}
      {badge && <PresenceBadge info={badge} />}
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
function MemberPicker({ onPick, presence }: { onPick: (userId: string) => void; presence: PresenceMap }) {
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
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate text-sm text-gray-800">{m.name}</span>
                      <PresenceBadge info={presence[m.user_id]} />
                    </span>
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

