'use client';

// 레코드 스레드 — 레코드(수주·제품·거래처·A/S) 상세 화면에 직접 붙는 대화 (F안 핵심).
// "이 건 어떻게 됐어?"가 카톡/채널이 아니라 레코드 위에서 일어나게 한다.
//
// 구성: ① 이 레코드 전용 스레드(메시지 + 컴포저, 채널은 첫 메시지 시점 지연 생성)
//       ② ERP 봇 시스템 메시지(상태 전이 자동 기록)도 같은 스레드에 흐른다
//       ③ 다른 채널에서 이 레코드를 멘션한 대화(역링크) — 기존 RecordChatPanel 흡수
// chat 모듈이 꺼져 있으면 렌더하지 않는다(유기적).
//
// 타임라인 통합(실험적, 롤백 쉬움 — 이 파일 하나로 격리): "대화" 박스 + 접힌 "다른 채널에서
// 언급됨" 목록으로 나뉘어 있던 걸, 시간순 하나의 피드로 합쳤다. 역링크 항목은 다른 채널의
// 대화 일부를 떼어온 거라 맥락이 없어서, 완전히 같은 말풍선으로 위장하지 않고
// 채널 태그를 붙인 얇은 카드로 구분해서 보여준다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { MessagesSquare, Hash, User } from 'lucide-react';
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
  const [me, setMe] = useState<{ id: string | null; name: string }>({ id: null, name: '나' });
  const bottomRef = useRef<HTMLDivElement>(null);

  // 시간순 통합 타임라인: 이 레코드 전용 스레드 + 다른 채널에서의 언급을 하나로 정렬
  type TimelineItem =
    | { kind: 'own'; ts: string; message: Message }
    | { kind: 'backlink'; ts: string; mention: RecordMention };
  const timeline = useMemo<TimelineItem[]>(() => {
    const own: TimelineItem[] = (messages ?? []).map((m) => ({ kind: 'own', ts: m.created_at, message: m }));
    const foreign: TimelineItem[] = backlinks.map((b) => ({ kind: 'backlink', ts: b.created_at, mention: b }));
    return [...own, ...foreign].sort((a, b) => dayjs(a.ts).valueOf() - dayjs(b.ts).valueOf());
  }, [messages, backlinks]);
  const isLoaded = messages !== null;

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
  }, [timeline.length]);

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

  const ownCount = (messages ?? []).filter((m) => !m.is_system).length;
  const totalCount = ownCount + backlinks.length;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <MessagesSquare size={15} className="text-gray-400" />
        대화
        {totalCount > 0 && <span className="text-xs font-normal text-gray-400">{totalCount}</span>}
        <span className="ml-1 text-[11px] font-normal text-gray-400">이 레코드에 연결된 기록 — 시간순</span>
      </div>

      {/* 통합 타임라인: 이 레코드 전용 스레드 + 다른 채널에서의 언급을 하나로 */}
      <div className="rounded-lg border bg-white">
        <div className="max-h-96 overflow-y-auto px-4 py-3">
          {!isLoaded && <p className="py-2 text-xs text-gray-400">불러오는 중…</p>}
          {isLoaded && timeline.length === 0 && (
            <p className="py-2 text-xs text-gray-400">
              아직 대화가 없습니다. 담당자를 @멘션하면 알림이 갑니다 — 이 레코드에 대한 논의는 여기서.
            </p>
          )}
          <div className="space-y-2.5">
            {timeline.map((item) => item.kind === 'own' ? (
              <MessageItem
                key={item.message.id}
                m={item.message}
                meId={me.id}
                meName={me.name}
                onReact={handleReact}
                onJump={jump}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ) : (
              // 역링크 항목 — 다른 채널 대화의 일부라 맥락이 없으므로 얇은 카드 + 채널 태그로 구분
              <button
                key={`bl-${item.mention.message_id}`}
                onClick={() => item.mention.channel_id && router.push(`/chat?channel=${item.mention.channel_id}`)}
                className="block w-full rounded-md border border-dashed bg-gray-50/60 px-3 py-2 text-left transition-colors hover:bg-gray-100"
              >
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  {item.mention.channel_kind === 'dm' ? <User size={11} /> : <Hash size={11} />}
                  <span className="truncate font-medium">{item.mention.channel_kind === 'dm' ? 'DM' : (item.mention.channel_name ?? '채널')}</span>
                  <span>·</span>
                  <span className="truncate">{item.mention.author_name ?? '사용자'}</span>
                  <span className="ml-auto flex-shrink-0">{dayjs(item.mention.created_at).format('MM.DD HH:mm')}</span>
                </div>
                {item.mention.body && <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{item.mention.body}</p>}
              </button>
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
    </div>
  );
}
