'use client';

// 레코드 스레드 — 레코드(수주·제품·거래처·A/S) 상세 화면에 직접 붙는 대화 (F안 핵심).
// "이 건 어떻게 됐어?"가 카톡/채널이 아니라 레코드 위에서 일어나게 한다.
//
// 구성: ① 이 레코드 전용 스레드(메시지 + 컴포저, 채널은 첫 메시지 시점 지연 생성)
//       ② ERP 봇 시스템 메시지(상태 전이 자동 기록)도 같은 스레드에 흐른다
//       ③ 다른 채널에서 이 레코드를 멘션한 대화(역링크) — 기존 RecordChatPanel 흡수
// chat 모듈이 꺼져 있으면 렌더하지 않는다(유기적).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { MessagesSquare, Hash, User, ChevronDown, ChevronRight } from 'lucide-react';
import { useModuleEnabled } from '@/components/ModulesProvider';
import { createClient } from '@/lib/supabase/client';
import { entityHref } from '@/lib/entityLink';
import { MessageItem, Composer, type Message } from '@/components/chat/ChatParts';
import {
  getRecordThread, sendRecordMessage, getRecordMentions, markChannelRead,
  toggleReaction, editMessage, deleteMessage,
  type RecordMention, type MentionInput,
} from '@/actions/chat';
import type { AttachmentInput } from '@/actions/chat';
import { getCurrentUser } from '@/actions/auth';

interface Props {
  entityType: string;
  entityId: string;
  /** 스레드 채널명으로 쓰이는 라벨 (예: ORD-2025-0845, 제품명) */
  entityLabel: string;
  className?: string;
}

export default function RecordThread({ entityType, entityId, entityLabel, className }: Props) {
  const chatEnabled = useModuleEnabled('chat');
  const router = useRouter();

  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [backlinks, setBacklinks] = useState<RecordMention[]>([]);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [me, setMe] = useState<{ id: string | null; name: string }>({ id: null, name: '나' });
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async () => {
    const t = await getRecordThread(entityType, entityId);
    setChannelId(t.channelId);
    setMessages((t.messages ?? []) as Message[]);
    if (t.channelId) markChannelRead(t.channelId);
  }, [entityType, entityId]);

  // 최초 로드: 나 + 스레드 + 역링크
  useEffect(() => {
    if (!chatEnabled) return;
    let alive = true;
    getCurrentUser().then((u) => { if (alive && u) setMe({ id: u.id, name: u.name }); });
    // loadThread는 await 이후에만 setState한다(비동기) — 룰이 useCallback 내부를 추적하지 못해 오탐
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadThread().catch(() => { if (alive) setMessages([]); });
    getRecordMentions(entityType, entityId)
      .then((r) => { if (alive) setBacklinks(r); })
      .catch(() => { if (alive) setBacklinks([]); });
    return () => { alive = false; };
  }, [chatEnabled, entityType, entityId, loadThread]);

  // realtime: 이 스레드 채널의 메시지·반응 변경 구독
  useEffect(() => {
    if (!chatEnabled || !channelId) return;
    const supabase = createClient();
    const rt = supabase
      .channel(`record-thread-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, () => {
        loadThread();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        loadThread();
      })
      .subscribe();
    return () => { supabase.removeChannel(rt); };
  }, [chatEnabled, channelId, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages?.length]);

  if (!chatEnabled) return null;

  async function handleSend(body: string, mentions: MentionInput[], attachments: AttachmentInput[]) {
    const res = await sendRecordMessage(entityType, entityId, entityLabel, body, mentions, attachments);
    if (res?.error) { toast.error(res.error); return; }
    if (res.channelId && !channelId) setChannelId(res.channelId);
    await loadThread();
  }

  async function handleReact(messageId: string, emoji: string) {
    const res = await toggleReaction(messageId, emoji);
    if (res?.error) { toast.error(res.error); return; }
    await loadThread();
  }

  async function handleEdit(messageId: string, body: string) {
    const res = await editMessage(messageId, body);
    if (res?.error) { toast.error(res.error); return false; }
    await loadThread();
    return true;
  }

  async function handleDelete(messageId: string) {
    if (!confirm('메시지를 삭제하시겠습니까?')) return;
    const res = await deleteMessage(messageId);
    if (res?.error) { toast.error(res.error); return; }
    await loadThread();
  }

  function jump(type: string, id: string) {
    const href = entityHref(type, id);
    if (href && href !== '#') router.push(href);
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <MessagesSquare size={15} className="text-gray-400" />
        대화
        {messages && messages.length > 0 && (
          <span className="text-xs font-normal text-gray-400">{messages.filter((m) => !m.is_system).length}</span>
        )}
        <span className="ml-1 text-[11px] font-normal text-gray-400">이 레코드에 연결된 스레드</span>
      </div>

      {/* 스레드 메시지 */}
      <div className="rounded-lg border bg-white">
        <div className="max-h-96 overflow-y-auto px-4 py-3">
          {messages === null && <p className="py-2 text-xs text-gray-400">불러오는 중…</p>}
          {messages !== null && messages.length === 0 && (
            <p className="py-2 text-xs text-gray-400">
              아직 대화가 없습니다. 담당자를 @멘션하면 알림이 갑니다 — 이 레코드에 대한 논의는 여기서.
            </p>
          )}
          <div className="space-y-2.5">
            {(messages ?? []).map((m) => (
              <MessageItem
                key={m.id}
                m={m}
                meId={me.id}
                meName={me.name}
                onReact={handleReact}
                onJump={jump}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <div ref={bottomRef} />
        </div>

        {/* 컴포저 — 채널 없어도 입력 가능(첫 메시지 시점에 채널 생성) */}
        <Composer
          channelId={channelId ?? entityId}
          placeholder={`${entityLabel}에 대해 대화`}
          onSend={handleSend}
        />
      </div>

      {/* 다른 채널에서 이 레코드를 멘션한 대화 (역링크) */}
      {backlinks.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setBacklinksOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            {backlinksOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            다른 채널에서 언급됨 {backlinks.length}건
          </button>
          {backlinksOpen && (
            <div className="mt-1.5 space-y-1.5">
              {backlinks.map((m) => (
                <button
                  key={m.message_id}
                  onClick={() => m.channel_id && router.push(`/chat?channel=${m.channel_id}`)}
                  className="block w-full rounded-md border bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    {m.channel_kind === 'dm' ? <User size={11} /> : <Hash size={11} />}
                    <span className="truncate">{m.channel_kind === 'dm' ? 'DM' : (m.channel_name ?? '채널')}</span>
                    <span>·</span>
                    <span className="truncate">{m.author_name ?? '사용자'}</span>
                    <span className="ml-auto flex-shrink-0">{dayjs(m.created_at).format('MM.DD HH:mm')}</span>
                  </div>
                  {m.body && <p className="mt-0.5 line-clamp-2 text-sm text-gray-700">{m.body}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
