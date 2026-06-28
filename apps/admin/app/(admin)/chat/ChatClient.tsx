'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Plus, Hash, Send, AtSign, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  getMessages, sendMessage, getMentionCandidates, createChannel, type MentionInput,
} from '@/actions/chat';
import { entityHref, entityChipClass, ENTITY_LABEL } from '@/lib/entityLink';
import type { Channel } from './page';

interface Mention { entity_type: string; entity_id: string; label: string }
interface Message {
  id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  message_mentions: Mention[];
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
  const [body, setBody] = useState('');
  const [pending, setPending] = useState<Mention[]>([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 멘션 검색
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [candidates, setCandidates] = useState<MentionInput[]>([]);

  const active = channels.find((c) => c.id === activeId) ?? null;

  const loadMessages = useCallback(async (channelId: string) => {
    const rows = await getMessages(channelId);
    setMessages((rows ?? []) as Message[]);
  }, []);

  // 채널 선택 → 메시지 로드 + realtime 구독
  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);

    const supabase = createClient();
    const channel = supabase
      .channel(`room:${activeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeId}` },
        () => loadMessages(activeId),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeId, loadMessages]);

  // 새 메시지 오면 맨 아래로
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // 멘션 검색 (디바운스)
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

  async function handleSend() {
    if (!activeId) return;
    if (!body.trim() && pending.length === 0) return;
    setSending(true);
    const result = await sendMessage(activeId, body, pending);
    setSending(false);
    if (result?.error) { toast.error(result.error); return; }
    setBody('');
    setPending([]);
    loadMessages(activeId); // 내 화면 즉시 갱신(상대는 realtime)
  }

  async function handleCreateChannel() {
    const name = prompt('새 채널 이름 (예: 영업팀)');
    if (!name) return;
    const result = await createChannel(name);
    if (result?.error) { toast.error(result.error); return; }
    // 채널 목록 갱신
    const supabase = createClient();
    const { data } = await supabase.from('channels').select('id, name, kind').order('created_at');
    setChannels((data ?? []) as Channel[]);
    if (result.id) setActiveId(result.id);
  }

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
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={cn(
                'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors',
                activeId === c.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-200',
              )}
            >
              <Hash size={14} className="flex-shrink-0 opacity-60" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
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
          {messages.map((m) => {
            const mine = m.author_id === meId;
            return (
              <div key={m.id} className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-gray-900">{mine ? meName : (m.author_name ?? '사용자')}</span>
                  <span className="text-[11px] text-gray-400">{dayjs(m.created_at).format('MM.DD HH:mm')}</span>
                </div>
                {m.body && <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{m.body}</p>}
                {m.message_mentions?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.message_mentions.map((mn, i) => (
                      <button
                        key={i}
                        onClick={() => router.push(entityHref(mn.entity_type, mn.entity_id))}
                        className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition-colors', entityChipClass(mn.entity_type))}
                        title={`${ENTITY_LABEL[mn.entity_type] ?? mn.entity_type} 보기`}
                      >
                        <span className="opacity-60">{ENTITY_LABEL[mn.entity_type] ?? mn.entity_type}</span>
                        {mn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {messages.length === 0 && activeId && (
            <p className="text-center text-sm text-gray-400 pt-8">첫 메시지를 남겨보세요.</p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 작성 */}
        {activeId && (
          <div className="border-t p-3 relative">
            {/* 첨부된 엔티티 칩 */}
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

            {/* 멘션 검색 팝업 */}
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
                  {mentionQuery && candidates.length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-400">결과 없음</p>
                  )}
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
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={`#${active?.name ?? ''} 에 메시지… (Enter 전송, Shift+Enter 줄바꿈)`}
                rows={1}
                className="flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
              />
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
