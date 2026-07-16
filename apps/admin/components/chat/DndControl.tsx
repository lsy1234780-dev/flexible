'use client';

// 알림 일시중지(DND) — 채팅 사이드바 헤더의 작은 컨트롤.
// 켜져 있으면 그 시각까지 모든 푸시가 스킵된다 (notification_settings.dnd_until, 096).

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { MoonStar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDndUntil, setDndUntil } from '@/actions/push';

export default function DndControl() {
  const [until, setUntil] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getDndUntil().then(setUntil).catch(() => {});
  }, []);

  const active = until != null && dayjs(until).isAfter(dayjs());

  async function apply(next: string | null, label: string) {
    setOpen(false);
    const res = await setDndUntil(next);
    if (res?.error) { toast.error(res.error); return; }
    setUntil(next);
    toast.success(label);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn('p-1 rounded transition-colors', active ? 'text-violet-600 hover:text-violet-700' : 'text-gray-400 hover:text-gray-700')}
        title={active ? `알림 일시중지 중 (${dayjs(until).format('HH:mm')}까지)` : '알림 일시중지'}
      >
        <MoonStar size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-20 w-44 rounded-lg border bg-white py-1 shadow-xl">
            <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400">알림 일시중지</p>
            <button
              onClick={() => apply(dayjs().add(1, 'hour').toISOString(), '1시간 동안 알림을 끕니다')}
              className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              1시간
            </button>
            <button
              onClick={() => apply(dayjs().endOf('day').toISOString(), '오늘 하루 알림을 끕니다')}
              className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              오늘 하루
            </button>
            {active && (
              <button
                onClick={() => apply(null, '알림을 다시 받습니다')}
                className="block w-full border-t px-3 py-1.5 text-left text-sm font-medium text-violet-600 hover:bg-gray-100"
              >
                일시중지 해제
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
