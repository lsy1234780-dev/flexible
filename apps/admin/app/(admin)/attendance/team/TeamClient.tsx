'use client';

// 팀 현황 (근태 관리자 전용) — 오늘 출근 보드 + 부재 현황판(팀 캘린더).
// 부재 현황판이 이 모듈의 킬러 기능: 이번달 누가 연차·반차인지 한 화면에.
// 감시 아님 — presence 수준의 상태와 휴가 일정만 보여준다.

import { useState, useTransition } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Users, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getHolidays, type AttendancePolicy, type TeamMemberStatus } from '@/actions/attendance';
import { getTeamLeaves, type TeamLeaveItem } from '@/actions/leaves';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const WORK_TYPE_LABEL: Record<string, string> = { office: '사무실', remote: '재택', field: '외근' };

const STATUS_META: Record<TeamMemberStatus['status'], { label: string; cls: string; dot: string }> = {
  working: { label: '근무 중', cls: 'text-emerald-700', dot: 'bg-emerald-500' },
  done: { label: '퇴근', cls: 'text-gray-500', dot: 'bg-gray-400' },
  leave: { label: '휴가', cls: 'text-sky-700', dot: 'bg-sky-500' },
  not_in: { label: '출근 전', cls: 'text-amber-700', dot: 'bg-amber-400' },
  off: { label: '-', cls: 'text-gray-400', dot: 'bg-gray-300' },
};

interface Props {
  todayStatus: TeamMemberStatus[];
  policy: AttendancePolicy;
  initialHolidays: { id: string; holiday_date: string; name: string }[];
  initialLeaves: TeamLeaveItem[];
}

export default function TeamClient({ todayStatus, policy, initialHolidays, initialLeaves }: Props) {
  const [, startTransition] = useTransition();
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [leaves, setLeaves] = useState(initialLeaves);
  const [holidays, setHolidays] = useState(initialHolidays);

  function moveMonth(diff: number) {
    const next = month.add(diff, 'month');
    setMonth(next);
    startTransition(async () => {
      const [lvs, hols] = await Promise.all([
        getTeamLeaves(next.format('YYYY-MM-DD'), next.endOf('month').format('YYYY-MM-DD')),
        getHolidays(next.year()),
      ]);
      setLeaves(lvs);
      setHolidays(hols);
    });
  }

  const holidayMap = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  function leavesOn(date: string): TeamLeaveItem[] {
    return leaves.filter((l) => l.start_date <= date && date <= l.end_date && l.status === 'approved');
  }

  const firstDay = month.day();
  const daysInMonth = month.daysInMonth();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => month.date(i + 1).format('YYYY-MM-DD')),
  ];

  const counts = {
    working: todayStatus.filter((m) => m.status === 'working').length,
    leave: todayStatus.filter((m) => m.status === 'leave').length,
    not_in: todayStatus.filter((m) => m.status === 'not_in').length,
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">팀 현황</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          오늘 근무 {counts.working}명 · 휴가 {counts.leave}명 · 출근 전 {counts.not_in}명
        </p>
      </div>

      {/* 오늘 보드 */}
      <div className="rounded-xl border bg-white p-4">
        <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 text-sm mb-3">
          <Users size={15} /> 오늘 ({dayjs().format('M/D')} {DAY_LABELS[dayjs().day()]})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {todayStatus.map((m) => {
            const meta = STATUS_META[m.status];
            return (
              <div key={m.user_id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('h-2 w-2 rounded-full flex-shrink-0', meta.dot)} />
                  <span className="text-sm font-medium text-gray-900 truncate">{m.name}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={cn('text-xs font-medium', meta.cls)}>
                    {m.status === 'leave' ? m.leave_label : meta.label}
                    {m.status === 'working' && m.work_type && m.work_type !== 'office' && ` (${WORK_TYPE_LABEL[m.work_type]})`}
                  </p>
                  {m.clock_in_at && (
                    <p className="text-[11px] text-gray-400">
                      {dayjs(m.clock_in_at).format('HH:mm')}
                      {m.clock_out_at && `~${dayjs(m.clock_out_at).format('HH:mm')}`}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 부재 현황판 */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 text-sm">
            <CalendarDays size={15} /> 부재 현황판 — {month.format('YYYY년 M월')}
          </h2>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveMonth(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveMonth(1)}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-400 mb-1">
          {DAY_LABELS.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} />;
            const d = dayjs(date);
            const holiday = holidayMap.get(date);
            const dayLeaves = leavesOn(date);
            const isWorkDay = policy.work_days.includes(d.day()) && !holiday;
            const isToday = date === dayjs().format('YYYY-MM-DD');
            return (
              <div
                key={date}
                className={cn(
                  'min-h-[72px] rounded-lg border p-1.5',
                  !isWorkDay && 'bg-gray-50',
                  isToday && 'border-gray-900',
                )}
              >
                <p className={cn(
                  'text-xs font-medium',
                  d.day() === 0 || holiday ? 'text-red-500' : d.day() === 6 ? 'text-blue-500' : 'text-gray-700',
                )}>
                  {d.date()}
                </p>
                {holiday && <p className="text-[10px] text-red-500 truncate">{holiday}</p>}
                <div className="mt-0.5 space-y-0.5">
                  {dayLeaves.slice(0, 3).map((l) => (
                    <p key={l.id} className="rounded bg-sky-50 px-1 py-px text-[10px] text-sky-700 truncate">
                      {l.user_name ?? '팀원'} {l.type_name}
                    </p>
                  ))}
                  {dayLeaves.length > 3 && (
                    <p className="text-[10px] text-gray-400">+{dayLeaves.length - 3}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
