'use client';

// 레코드 화면의 "관련 대화" 패널 (역링크) — ShareToChat의 반대 방향.
// 이 레코드를 멘션한 메시지들을 보여주고, 클릭하면 해당 채널로 점프(/chat?channel=).
// chat 모듈이 꺼져 있으면 렌더하지 않는다(유기적).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { MessagesSquare, Hash, User } from 'lucide-react';
import { useModuleEnabled } from '@/components/ModulesProvider';
import { getRecordMentions, type RecordMention } from '@/actions/chat';

interface Props {
  entityType: string;
  entityId: string;
  className?: string;
}

export default function RecordChatPanel({ entityType, entityId, className }: Props) {
  const chatEnabled = useModuleEnabled('chat');
  const router = useRouter();
  const [rows, setRows] = useState<RecordMention[] | null>(null);

  useEffect(() => {
    if (!chatEnabled) return;
    let alive = true;
    getRecordMentions(entityType, entityId)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [chatEnabled, entityType, entityId]);

  if (!chatEnabled) return null;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <MessagesSquare size={15} className="text-gray-400" />
        관련 대화
        {rows && rows.length > 0 && <span className="text-xs font-normal text-gray-400">{rows.length}</span>}
      </div>

      {rows === null && <p className="text-xs text-gray-400">불러오는 중…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="text-xs text-gray-400">아직 이 레코드를 멘션한 대화가 없습니다. 상단 “공유”로 채팅에 올려보세요.</p>
      )}

      <div className="space-y-1.5">
        {(rows ?? []).map((m) => (
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
    </div>
  );
}
