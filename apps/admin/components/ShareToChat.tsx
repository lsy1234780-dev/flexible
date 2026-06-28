'use client';

// 레코드 → 채팅 공유 버튼 (모듈화 OS 프리미티브).
// 어느 레코드 화면이든 <ShareToChat entityType entityId label /> 한 줄로 꽂는다.
// "이해 안 가는 부분 있으면 → 공유 → 메모 적고 → 사람/채널로 전송".
//
// 엔티티 종류를 직접 알 필요 없음: 호출 측이 type/id/label만 넘기면 된다.
// (멘션 칩 색/라벨은 채팅 화면에서 moduleRegistry로 렌더됨.)

import { useState } from 'react';
import { toast } from 'sonner';
import { Share2, Hash, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModuleEnabled } from '@/components/ModulesProvider';
import { useChatWidget } from '@/lib/chatWidgetStore';
import { getChannels, getWorkspaceMembers, shareToChat } from '@/actions/chat';

interface Props {
  entityType: string;
  entityId: string;
  label: string;
  className?: string;
}

interface Dest {
  kind: 'channel' | 'user';
  id: string;
  name: string;
}

export default function ShareToChat({ entityType, entityId, label, className }: Props) {
  const chatEnabled = useModuleEnabled('chat');
  const openWidget = useChatWidget((s) => s.openWidget);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [dests, setDests] = useState<Dest[] | null>(null);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState<string | null>(null);

  async function load() {
    const [channels, members] = await Promise.all([getChannels(), getWorkspaceMembers()]);
    const cd: Dest[] = (channels as { id: string; name: string; kind: string }[])
      .filter((c) => c.kind === 'channel')
      .map((c) => ({ kind: 'channel', id: c.id, name: c.name }));
    const md: Dest[] = members.map((m) => ({ kind: 'user', id: m.user_id, name: m.name }));
    setDests([...cd, ...md]);
  }

  function toggle() {
    setOpen((o) => !o);
    if (!dests) load();
  }

  async function send(d: Dest) {
    setSending(d.id);
    const res = await shareToChat({
      dest: { type: d.kind, id: d.id },
      note,
      mention: { entity_type: entityType, entity_id: entityId, label },
    });
    setSending(null);
    if (res?.error) { toast.error(res.error); return; }
    toast.success(`${d.kind === 'channel' ? '#' : '@'}${d.name} 으로 공유했어요`);
    setOpen(false);
    setNote('');
    setQ('');
    // 공유한 대화를 우측 하단 미니 위젯으로 바로 띄움 (업무 중에도 확인)
    if (res.channelId) openWidget(res.channelId);
  }

  const filtered = (dests ?? []).filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  const channels = filtered.filter((d) => d.kind === 'channel');
  const users = filtered.filter((d) => d.kind === 'user');

  // chat 모듈이 꺼진 워크스페이스에선 공유 버튼 자체를 숨김
  if (!chatEnabled) return null;

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        title="채팅으로 공유 / 멘션"
      >
        <Share2 size={13} />
        공유
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-72 rounded-lg border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold text-gray-700">채팅으로 공유</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={15} />
              </button>
            </div>

            {/* 멘션될 레코드 미리보기 */}
            <div className="px-3 pt-2">
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600">
                <span className="opacity-60">@</span>
                <span className="truncate">{label}</span>
              </span>
            </div>

            {/* 메모 */}
            <div className="px-3 py-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="메모 (선택) — 예: 이 부분이 이해가 안 가요"
                rows={2}
                className="w-full resize-none rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>

            {/* 대상 선택 */}
            <div className="border-t">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="채널·사람 검색…"
                className="w-full border-b px-3 py-2 text-sm outline-none"
              />
              <div className="max-h-52 overflow-y-auto py-1">
                {dests === null && <p className="px-3 py-3 text-xs text-gray-400">불러오는 중…</p>}

                {channels.length > 0 && <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase text-gray-400">채널</p>}
                {channels.map((d) => (
                  <button
                    key={d.id}
                    disabled={sending !== null}
                    onClick={() => send(d)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100 disabled:opacity-50"
                  >
                    <Hash size={14} className="text-gray-400" />
                    <span className="truncate">{d.name}</span>
                  </button>
                ))}

                {users.length > 0 && <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase text-gray-400">사람 (DM)</p>}
                {users.map((d) => (
                  <button
                    key={d.id}
                    disabled={sending !== null}
                    onClick={() => send(d)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100 disabled:opacity-50"
                  >
                    <User size={14} className="text-gray-400" />
                    <span className="truncate">{d.name}</span>
                  </button>
                ))}

                {dests !== null && filtered.length === 0 && (
                  <p className="px-3 py-3 text-xs text-gray-400">대상이 없습니다</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
