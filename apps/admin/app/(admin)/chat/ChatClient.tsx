'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  Plus, Hash, Send, AtSign, X, SmilePlus, MessageSquare, CornerDownRight,
  ChevronLeft, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  getMessages, sendMessage, getMentionCandidates, getMentionCategories, createChannel, getChannels,
  markChannelRead, toggleReaction, getWorkspaceMembers, startDirectMessage, type MentionInput,
} from '@/actions/chat';
import { entityHref, entityChipClass, ENTITY_LABEL } from '@/lib/entityLink';
import type { Channel } from './page';

const EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🙏'];

interface Mention { entity_type: string; entity_id: string; label: string }
interface Reaction { emoji: string; user_id: string | null }
interface Message {
  id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  reply_to: string | null;
  message_mentions: Mention[];
  message_reactions: Reaction[];
}
interface Member { user_id: string; name: string; email: string }

interface Props {
  channels: Channel[];
  meId: string | null;
  meName: string;
}

const channelLabel = (c: Channel) => (c.kind === 'dm' ? (c.partner_name ?? '다이렉트 메시지') : c.name);

export default function ChatClient({ channels: initialChannels, meId, meName }: Props) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [activeId, setActiveId] = useState<string | null>(initialChannels[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadParent, setThreadParent] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        if (activeId) loadMessages(activeId);
      })
      .subscribe();

    return () => { supabase.removeChannel(rt); };
  }, [activeId, loadMessages, refreshChannels]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend(body: string, mentions: Mention[], replyTo: string | null = null) {
    if (!activeId) return;
    const result = await sendMessage(activeId, body, mentions, replyTo);
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

  const topLevel = messages.filter((m) => !m.reply_to);
  const replyCount = (parentId: string) => messages.filter((m) => m.reply_to === parentId).length;
  const threadMsg = threadParent ? messages.find((m) => m.id === threadParent) ?? null : null;
  const threadReplies = threadParent ? messages.filter((m) => m.reply_to === threadParent) : [];

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-4 md:-m-6">
      {/* 사이드바 */}
      <aside className="w-56 flex-shrink-0 border-r bg-gray-50 flex flex-col">
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
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {topLevel.map((m) => (
            <MessageItem
              key={m.id}
              m={m}
              meId={meId}
              meName={meName}
              onReact={handleReact}
              onOpenThread={() => setThreadParent(m.id)}
              onJump={jump}
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
            placeholder={active?.kind === 'dm' ? `${channelLabel(active)} 에게 메시지…` : `#${active ? channelLabel(active) : ''} 에 메시지…`}
            onSend={(body, mentions) => handleSend(body, mentions, null)}
          />
        )}
      </section>

      {/* 스레드 패널 */}
      {threadMsg && (
        <aside className="w-96 flex-shrink-0 border-l flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 h-12 border-b">
            <span className="text-sm font-semibold text-gray-700">스레드</span>
            <button onClick={() => setThreadParent(null)} className="p-1 text-gray-400 hover:text-gray-700">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <MessageItem m={threadMsg} meId={meId} meName={meName} onReact={handleReact} onJump={jump} />
            {threadReplies.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span>{threadReplies.length}개 답글</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
            )}
            {threadReplies.map((r) => (
              <div key={r.id} className="pl-3 border-l-2 border-gray-100">
                <MessageItem m={r} meId={meId} meName={meName} onReact={handleReact} onJump={jump} />
              </div>
            ))}
          </div>
          <Composer placeholder="답글 남기기…" onSend={(body, mentions) => handleSend(body, mentions, threadMsg.id)} />
        </aside>
      )}
    </div>
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

// ─── DM 시작용 멤버 피커 ───
function MemberPicker({ onPick }: { onPick: (userId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    getWorkspaceMembers().then((m) => { setMembers(m); setLoaded(true); });
  }, [open, loaded]);

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="p-0.5 text-gray-400 hover:text-gray-700" title="새 메시지">
        <Plus size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 w-52 rounded-lg border bg-white py-1 shadow-lg">
            <p className="px-3 py-1 text-[11px] font-semibold text-gray-400">멤버 선택</p>
            <div className="max-h-60 overflow-y-auto">
              {members.map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => { onPick(m.user_id); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-medium text-gray-600">
                    {m.name.slice(0, 1)}
                  </span>
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
              {loaded && members.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">다른 멤버가 없습니다</p>}
              {!loaded && <p className="px-3 py-2 text-xs text-gray-400">불러오는 중…</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 메시지 한 줄 ───
interface MessageItemProps {
  m: Message;
  meId: string | null;
  meName: string;
  onReact: (messageId: string, emoji: string) => void;
  onJump: (entityType: string, entityId: string) => void;
  onOpenThread?: () => void;
  replyCount?: number;
}

function MessageItem({ m, meId, meName, onReact, onJump, onOpenThread, replyCount = 0 }: MessageItemProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const mine = m.author_id === meId;

  const agg = new Map<string, { count: number; mine: boolean }>();
  for (const r of m.message_reactions ?? []) {
    const cur = agg.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.user_id === meId) cur.mine = true;
    agg.set(r.emoji, cur);
  }

  return (
    <div className="group flex flex-col relative">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-gray-900">{mine ? meName : (m.author_name ?? '사용자')}</span>
        <span className="text-[11px] text-gray-400">{dayjs(m.created_at).format('MM.DD HH:mm')}</span>
        <span className="ml-auto hidden group-hover:flex items-center gap-1">
          <button onClick={() => setPickerOpen((v) => !v)} className="p-1 text-gray-400 hover:text-gray-700" title="반응 추가">
            <SmilePlus size={14} />
          </button>
          {onOpenThread && (
            <button onClick={onOpenThread} className="p-1 text-gray-400 hover:text-gray-700" title="스레드로 답글">
              <CornerDownRight size={14} />
            </button>
          )}
        </span>
      </div>

      {m.body && <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{m.body}</p>}

      {m.message_mentions?.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {m.message_mentions.map((mn, i) => (
            <button
              key={i}
              onClick={() => onJump(mn.entity_type, mn.entity_id)}
              className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition-colors', entityChipClass(mn.entity_type))}
              title={`${ENTITY_LABEL[mn.entity_type] ?? mn.entity_type} 보기`}
            >
              <span className="opacity-60">{ENTITY_LABEL[mn.entity_type] ?? mn.entity_type}</span>
              {mn.label}
            </button>
          ))}
        </div>
      )}

      {(agg.size > 0 || pickerOpen) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {[...agg.entries()].map(([emoji, info]) => (
            <button
              key={emoji}
              onClick={() => onReact(m.id, emoji)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                info.mine ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100',
              )}
            >
              <span>{emoji}</span>
              <span className="tabular-nums">{info.count}</span>
            </button>
          ))}
          {pickerOpen && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-0.5">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => { onReact(m.id, e); setPickerOpen(false); }} className="rounded px-1 text-sm hover:bg-gray-100">
                  {e}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {onOpenThread && replyCount > 0 && (
        <button onClick={onOpenThread} className="mt-1 inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-blue-600 hover:underline">
          <MessageSquare size={12} />
          답글 {replyCount}개
        </button>
      )}
    </div>
  );
}

// ─── 작성 컴포넌트 (채널/스레드 공용) — 엔티티 멘션 2단 메뉴 ───
interface ComposerProps {
  placeholder: string;
  onSend: (body: string, mentions: Mention[]) => Promise<void> | void;
}

function Composer({ placeholder, onSend }: ComposerProps) {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState<Mention[]>([]);
  const [sending, setSending] = useState(false);

  // 멘션 메뉴: open → (카테고리 선택) → 항목 리스트
  const [menuOpen, setMenuOpen] = useState(false);
  const [categories, setCategories] = useState<{ type: string; label: string }[] | null>(null);
  const [activeCat, setActiveCat] = useState<{ type: string; label: string } | null>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MentionInput[]>([]);

  // 메뉴 열면 카테고리 로드
  useEffect(() => {
    if (!menuOpen || categories) return;
    getMentionCategories().then(setCategories);
  }, [menuOpen, categories]);

  // 카테고리 선택/검색어 변경 → 항목 로드 (디바운스)
  useEffect(() => {
    if (!activeCat) return;
    const t = setTimeout(async () => {
      const rows = await getMentionCandidates(query, activeCat.type);
      setItems(rows);
    }, 180);
    return () => clearTimeout(t);
  }, [activeCat, query]);

  function openMenu() {
    setMenuOpen((v) => !v);
    setActiveCat(null);
    setQuery('');
    setItems([]);
  }

  function selectCategory(cat: { type: string; label: string }) {
    setActiveCat(cat);
    setQuery('');
    setItems([]);
  }

  function addMention(m: MentionInput) {
    if (!pending.some((p) => p.entity_type === m.entity_type && p.entity_id === m.entity_id)) {
      setPending((prev) => [...prev, m]);
    }
    setMenuOpen(false);
    setActiveCat(null);
    setQuery('');
    setItems([]);
  }

  async function submit() {
    if (!body.trim() && pending.length === 0) return;
    setSending(true);
    await onSend(body, pending);
    setSending(false);
    setBody('');
    setPending([]);
  }

  return (
    <div className="border-t p-3 relative">
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {pending.map((m, i) => (
            <span key={i} className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs', entityChipClass(m.entity_type))}>
              <span className="opacity-60">{ENTITY_LABEL[m.entity_type] ?? m.entity_type}</span>
              {m.label}
              <button onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))} className="hover:opacity-70">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 멘션 메뉴 (2단) */}
      {menuOpen && (
        <div className="absolute bottom-full left-3 mb-1 w-72 rounded-lg border bg-white shadow-lg overflow-hidden">
          {!activeCat ? (
            <div className="py-1">
              <p className="px-3 py-1 text-[11px] font-semibold text-gray-400">무엇을 멘션할까요?</p>
              {(categories ?? []).map((cat) => (
                <button
                  key={cat.type}
                  onClick={() => selectCategory(cat)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', entityChipClass(cat.type))}>{cat.label}</span>
                  <span className="text-gray-700">{cat.label} 멘션</span>
                </button>
              ))}
              {categories && categories.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-400">멘션 가능한 모듈이 없습니다</p>
              )}
              {!categories && <p className="px-3 py-3 text-xs text-gray-400">불러오는 중…</p>}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1 border-b px-2 py-1.5">
                <button onClick={() => setActiveCat(null)} className="p-1 text-gray-400 hover:text-gray-700">
                  <ChevronLeft size={14} />
                </button>
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', entityChipClass(activeCat.type))}>{activeCat.label}</span>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`${activeCat.label} 검색…`}
                  className="flex-1 px-1 py-0.5 text-sm outline-none"
                />
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {items.map((c) => (
                  <button
                    key={`${c.entity_type}-${c.entity_id}`}
                    onClick={() => addMention(c)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                  >
                    <span className="truncate">{c.label}</span>
                  </button>
                ))}
                {items.length === 0 && (
                  <p className="px-3 py-3 text-xs text-gray-400">{query ? '결과 없음' : '항목이 없습니다'}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={openMenu}
          className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border transition-colors', menuOpen ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100')}
          title="엔티티 멘션 (거래처/딜/제품/수주 태그)"
        >
          <AtSign size={16} />
        </button>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={`${placeholder} (Enter 전송, Shift+Enter 줄바꿈)`}
          rows={1}
          className="flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
        />
        <button
          onClick={submit}
          disabled={sending}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
