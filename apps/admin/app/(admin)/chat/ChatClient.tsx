'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Plus, Hash, Send, AtSign, X, SmilePlus, MessageSquare, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  getMessages, sendMessage, getMentionCandidates, createChannel, getChannels,
  markChannelRead, toggleReaction, type MentionInput,
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

interface Props {
  channels: Channel[];
  meId: string | null;
  meName: string;
}

export default function ChatClient({ channels: initialChannels, meId, meName }: Props) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [activeId, setActiveId] = useState<string | null>(initialChannels[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadParent, setThreadParent] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const active = channels.find((c) => c.id === activeId) ?? null;

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
    loadMessages(activeId); // 내 화면 즉시 갱신(상대는 realtime)
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

  const topLevel = messages.filter((m) => !m.reply_to);
  const replyCount = (parentId: string) => messages.filter((m) => m.reply_to === parentId).length;
  const threadMsg = threadParent ? messages.find((m) => m.id === threadParent) ?? null : null;
  const threadReplies = threadParent ? messages.filter((m) => m.reply_to === threadParent) : [];

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-4 md:-m-6">
      {/* 채널 목록 */}
      <aside className="w-56 flex-shrink-0 border-r bg-gray-50 flex flex-col">
        <div className="flex items-center justify-between px-3 h-12 border-b">
          <span className="text-sm font-semibold text-gray-700">채널</span>
          <button onClick={handleCreateChannel} className="p-1 text-gray-400 hover:text-gray-700" title="채널 추가">
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {channels.map((c) => {
            const unread = c.unread ?? 0;
            const isActive = activeId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors',
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-200',
                  !isActive && unread > 0 && 'font-semibold text-gray-900',
                )}
              >
                <Hash size={14} className="flex-shrink-0 opacity-60" />
                <span className="truncate flex-1 text-left">{c.name}</span>
                {!isActive && unread > 0 && (
                  <span className="flex-shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            );
          })}
          {channels.length === 0 && <p className="px-2 py-4 text-xs text-gray-400">채널이 없습니다</p>}
        </div>
      </aside>

      {/* 메시지 영역 */}
      <section className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 px-4 h-12 border-b">
          <Hash size={16} className="text-gray-400" />
          <span className="font-semibold text-gray-900">{active?.name ?? '채널 선택'}</span>
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
              onJump={(t, id) => router.push(entityHref(t, id))}
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
            placeholder={`#${active?.name ?? ''} 에 메시지…`}
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
            <MessageItem m={threadMsg} meId={meId} meName={meName} onReact={handleReact} onJump={(t, id) => router.push(entityHref(t, id))} />
            {threadReplies.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span>{threadReplies.length}개 답글</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
            )}
            {threadReplies.map((r) => (
              <div key={r.id} className="pl-3 border-l-2 border-gray-100">
                <MessageItem m={r} meId={meId} meName={meName} onReact={handleReact} onJump={(t, id) => router.push(entityHref(t, id))} />
              </div>
            ))}
          </div>
          <Composer placeholder="답글 남기기…" onSend={(body, mentions) => handleSend(body, mentions, threadMsg.id)} />
        </aside>
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

  // 반응 집계
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

        {/* 호버 액션 */}
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

      {/* 엔티티 멘션 칩 */}
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

      {/* 반응 칩 */}
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
                <button
                  key={e}
                  onClick={() => { onReact(m.id, e); setPickerOpen(false); }}
                  className="rounded px-1 text-sm hover:bg-gray-100"
                >
                  {e}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {/* 스레드 답글 수 */}
      {onOpenThread && replyCount > 0 && (
        <button
          onClick={onOpenThread}
          className="mt-1 inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-blue-600 hover:underline"
        >
          <MessageSquare size={12} />
          답글 {replyCount}개
        </button>
      )}
    </div>
  );
}

// ─── 작성 컴포넌트 (채널/스레드 공용) ───
interface ComposerProps {
  placeholder: string;
  onSend: (body: string, mentions: Mention[]) => Promise<void> | void;
}

function Composer({ placeholder, onSend }: ComposerProps) {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState<Mention[]>([]);
  const [sending, setSending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [candidates, setCandidates] = useState<MentionInput[]>([]);

  useEffect(() => {
    if (!mentionOpen) return;
    const t = setTimeout(async () => {
      const rows = await getMentionCandidates(mentionQuery);
      setCandidates(rows);
    }, 200);
    return () => clearTimeout(t);
  }, [mentionQuery, mentionOpen]);

  function addMention(m: MentionInput) {
    if (!pending.some((p) => p.entity_type === m.entity_type && p.entity_id === m.entity_id)) {
      setPending((prev) => [...prev, m]);
    }
    setMentionOpen(false);
    setMentionQuery('');
    setCandidates([]);
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
              {m.label}
              <button onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))} className="hover:opacity-70">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {mentionOpen && (
        <div className="absolute bottom-full left-3 mb-1 w-72 rounded-lg border bg-white shadow-lg">
          <input
            autoFocus
            value={mentionQuery}
            onChange={(e) => setMentionQuery(e.target.value)}
            placeholder="거래처·딜·제품·수주 검색…"
            className="w-full border-b px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            {candidates.map((c) => (
              <button
                key={`${c.entity_type}-${c.entity_id}`}
                onClick={() => addMention(c)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
              >
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', entityChipClass(c.entity_type))}>
                  {ENTITY_LABEL[c.entity_type] ?? c.entity_type}
                </span>
                <span className="truncate">{c.label}</span>
              </button>
            ))}
            {mentionQuery && candidates.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">결과 없음</p>}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => setMentionOpen((v) => !v)}
          className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border transition-colors', mentionOpen ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100')}
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
