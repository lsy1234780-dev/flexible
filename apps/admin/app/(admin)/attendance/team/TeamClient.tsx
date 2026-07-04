'use client';

// 팀 현황 (근태 관리자 전용) — 오늘 출근 보드 + 부재 현황판(팀 캘린더).
// 부재 현황판이 이 모듈의 킬러 기능: 이번달 누가 연차·반차인지 한 화면에.
// 감시 아님 — presence 수준의 상태와 휴가 일정만 보여준다.

import { useState, useTransition } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Users, CalendarDays, Building2, House, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getHolidays, getTeamWorkTypeStats, type AttendancePolicy, type TeamMemberStatus, type WorkTypeStatRow } from '@/actions/attendance';
import { getTeamLeaves, type TeamLeaveItem } from '@/actions/leaves';

function fmtH(min: number): string {
  if (!min) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

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
  initialTypeStats: WorkTypeStatRow[];
}

export default function TeamClient({ todayStatus, policy, initialHolidays, initialLeaves, initialTypeStats }: Props) {
  const [, startTransition] = useTransition();
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [leaves, setLeaves] = useState(initialLeaves);
  const [holidays, setHolidays] = useState(initialHolidays);
  const [typeStats, setTypeStats] = useState(initialTypeStats);

  function moveMonth(diff: number) {
    const next = month.add(diff, 'month');
    setMonth(next);
    startTransition(async () => {
      const [lvs, hols, stats] = await Promise.all([
        getTeamLeaves(next.format('YYYY-MM-DD'), next.endOf('month').format('YYYY-MM-DD')),
        getHolidays(next.year()),
        getTeamWorkTypeStats(next.year(), next.month() + 1),
      ]);
      setLeaves(lvs);
      setHolidays(hols);
      setTypeStats(stats);
    });
  }

  // 형태별 팀 합계 (상단 요약 바)
  const teamTotals = typeStats.reduce(
    (a, r) => ({ office: a.office + r.office, remote: a.remote + r.remote, field: a.field + r.field }),
    { office: 0, remote: 0, field: 0 },
  );
  const grandTotal = teamTotals.office + teamTotals.remote + teamTotals.field;
  const pct = (v: number) => (grandTotal ? Math.round((v / grandTotal) * 100) : 0);

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

      {/* 근무 형태별 집계 — 사무실/재택/외근 개별 수집 (경영진·인사팀 판단용) */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 text-sm">
            <Briefcase size={15} /> 근무 형태별 집계 — {month.format('YYYY년 M월')}
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

        {grandTotal === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">이 달 집계된 근무 기록이 없습니다</p>
        ) : (
          <>
            {/* 팀 합계 비중 바 */}
            <div className="mb-3">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                {teamTotals.office > 0 && <div className="bg-indigo-500" style={{ width: `${pct(teamTotals.office)}%` }} />}
                {teamTotals.remote > 0 && <div className="bg-emerald-500" style={{ width: `${pct(teamTotals.remote)}%` }} />}
                {teamTotals.field > 0 && <div className="bg-amber-500" style={{ width: `${pct(teamTotals.field)}%` }} />}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1 text-gray-600"><span className="h-2 w-2 rounded-full bg-indigo-500" /><Building2 size={12} /> 사무실 {fmtH(teamTotals.office)} ({pct(teamTotals.office)}%)</span>
                <span className="flex items-center gap-1 text-gray-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /><House size={12} /> 재택 {fmtH(teamTotals.remote)} ({pct(teamTotals.remote)}%)</span>
                <span className="flex items-center gap-1 text-gray-600"><span className="h-2 w-2 rounded-full bg-amber-500" /><Briefcase size={12} /> 외근 {fmtH(teamTotals.field)} ({pct(teamTotals.field)}%)</span>
              </div>
            </div>

            {/* 팀원별 표 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-400">
                    <th className="py-2 text-left font-medium">팀원</th>
                    <th className="py-2 text-right font-medium">사무실</th>
                    <th className="py-2 text-right font-medium">재택</th>
                    <th className="py-2 text-right font-medium">외근</th>
                    <th className="py-2 text-right font-medium">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {typeStats.map((r) => (
                    <tr key={r.user_id} className="border-b last:border-0">
                      <td className="py-2 font-medium text-gray-900">{r.name}</td>
                      <td className="py-2 text-right text-gray-600">{fmtH(r.office)}</td>
                      <td className="py-2 text-right text-gray-600">{fmtH(r.remote)}</td>
                      <td className="py-2 text-right text-gray-600">{fmtH(r.field)}</td>
                      <td className="py-2 text-right font-semibold text-gray-900">{fmtH(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              출퇴근 기록의 근무 형태별 합계입니다. 재출근으로 형태가 바뀌면 세션별로 나눠 집계됩니다.
            </p>
          </>
        )}
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
