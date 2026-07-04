'use client';

// 부재 표시 공용 UI — 채팅(/chat)과 미니채팅 위젯이 같이 쓴다.
// PresenceBadge: 이름 옆에 붙는 작은 칩 (휴가=자동, 자리비움/외근=본인 설정).
// MyStatusControl: 내 상태 설정 버튼 + 드롭다운 (프리셋 + 직접 입력 + 해제).

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { CircleMinus, TreePalm } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMyStatus, setMyStatus, clearMyStatus, type PresenceInfo } from '@/actions/presence';

export function PresenceBadge({ info, className }: { info?: PresenceInfo | null; className?: string }) {
  if (!info) return null;
  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-medium leading-4',
        info.kind === 'leave'
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : 'border-amber-200 bg-amber-50 text-amber-700',
        className,
      )}
      title={info.kind === 'leave' ? `오늘 ${info.label} (휴가 승인됨)` : `본인 설정: ${info.label}`}
    >
      {info.kind === 'leave' ? <TreePalm size={10} /> : <CircleMinus size={10} />}
      {info.label}
    </span>
  );
}

const PRESETS = ['자리비움', '외근', '회의 중', '점심'];

// 내 상태 설정 — 오늘 하루만 유효(다음날 자동 해제). 휴가는 여기서 설정하는 게 아니라
// 휴가 신청이 승인되면 그 날짜에 자동으로 표시된다.
export function MyStatusControl({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    getMyStatus().then(setStatus).catch(() => {});
  }, []);

  function toggle() {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) {
        setCoords({
          left: Math.max(8, Math.min(r.left, window.innerWidth - 232)),
          top: Math.min(r.bottom + 4, window.innerHeight - 260),
        });
      }
      setCustom('');
    }
    setOpen((v) => !v);
  }

  async function apply(label: string) {
    setBusy(true);
    const res = await setMyStatus(label);
    setBusy(false);
    if (res?.error) { toast.error(res.error); return; }
    setStatus(label.trim());
    setOpen(false);
    onChanged?.();
  }

  async function clear() {
    setBusy(true);
    const res = await clearMyStatus();
    setBusy(false);
    if (res?.error) { toast.error(res.error); return; }
    setStatus(null);
    setOpen(false);
    onChanged?.();
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={cn(
          'flex max-w-28 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-4 transition-colors',
          status
            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600',
        )}
        title={status ? `내 상태: ${status} (오늘만 유효)` : '내 상태 설정 (자리비움·외근 등)'}
      >
        <CircleMinus size={10} className="flex-shrink-0" />
        <span className="truncate">{status ?? '상태'}</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[71] w-56 rounded-lg border bg-white py-1 shadow-xl"
            style={{ left: coords.left, top: coords.top }}
          >
            <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-gray-400">
              내 상태 — 오늘 하루만 표시됩니다
            </p>
            {PRESETS.map((p) => (
              <button
                key={p}
                disabled={busy}
                onClick={() => apply(p)}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100',
                  status === p && 'font-semibold text-amber-700',
                )}
              >
                {p}
              </button>
            ))}
            <div className="flex gap-1 px-2 py-1.5">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) apply(custom); }}
                placeholder="직접 입력…"
                maxLength={20}
                className="w-full min-w-0 flex-1 rounded-md border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-gray-400"
              />
              <button
                disabled={busy || !custom.trim()}
                onClick={() => apply(custom)}
                className="flex-shrink-0 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                설정
              </button>
            </div>
            {status && (
              <button
                disabled={busy}
                onClick={clear}
                className="block w-full border-t px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-100"
              >
                상태 해제
              </button>
            )}
            <p className="border-t px-3 py-1.5 text-[10px] leading-4 text-gray-400">
              휴가는 여기서 설정하지 않아요 — 휴가 신청이 승인되면 그 날짜에 자동으로 표시됩니다.
            </p>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
