'use client';

// 내 근태 — 출퇴근 버튼 + 이번주 집계 + 월 캘린더.
// 원칙: 기록과 산수만 보여준다. "초과"는 회사 설정 임계에 대한 알림이지 위반 판정이 아니다.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Clock, LogIn, LogOut, RotateCcw, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  clockIn, clockOut, getMyMonthRecords, getHolidays,
  type AttendancePolicy, type AttendanceRecord, type WeeklySummary,
} from '@/actions/attendance';
import { getMyLeaveRequests, type LeaveRequest } from '@/actions/leaves';

const WORK_TYPE_LABEL: Record<string, string> = { office: '사무실', remote: '재택', field: '외근' };
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function fmtMinutes(min: number | null | undefined): string {
  if (min == null) return '-';
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}

interface Props {
  policy: AttendancePolicy;
  initialToday: AttendanceRecord | null;
  initialMonthRecords: AttendanceRecord[];
  initialWeekly: WeeklySummary;
  initialHolidays: { id: string; holiday_date: string; name: string }[];
  initialLeaves: LeaveRequest[];
}

export default function AttendanceClient({
  policy, initialToday, initialMonthRecords, initialWeekly, initialHolidays, initialLeaves,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [workType, setWorkType] = useState<'office' | 'remote' | 'field'>('office');
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [records, setRecords] = useState(initialMonthRecords);
  const [holidays, setHolidays] = useState(initialHolidays);
  const [leaves, setLeaves] = useState(initialLeaves);

  const today = initialToday;
  const weekly = initialWeekly;

  function handleClockIn() {
    startTransition(async () => {
      const res = await clockIn(workType);
      if (res?.error) { toast.error(res.error); return; }
      toast.success(hasStarted ? '재출근 처리되었습니다' : '출근 처리되었습니다');
      router.refresh();
    });
  }

  function handleClockOut() {
    if (!confirm('퇴근 처리하시겠습니까? (필요하면 재출근할 수 있습니다)')) return;
    startTransition(async () => {
      const res = await clockOut();
      if (res?.error) { toast.error(res.error); return; }
      toast.success('퇴근 처리되었습니다');
      router.refresh();
    });
  }

  function moveMonth(diff: number) {
    const next = month.add(diff, 'month');
    setMonth(next);
    startTransition(async () => {
      const [recs, hols, lvs] = await Promise.all([
        getMyMonthRecords(next.year(), next.month() + 1),
        getHolidays(next.year()),
        getMyLeaveRequests(next.year()),
      ]);
      setRecords(recs);
      setHolidays(hols);
      setLeaves(lvs.filter((l) => l.status === 'approved'));
    });
  }

  // ─── 캘린더 셀 데이터 ───
  const holidayMap = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  const recordMap = new Map(records.map((r) => [r.work_date, r]));
  function leaveOn(date: string): LeaveRequest | undefined {
    return leaves.find((l) => l.start_date <= date && date <= l.end_date);
  }

  const firstDay = month.day(); // 0=일
  const daysInMonth = month.daysInMonth();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => month.date(i + 1).format('YYYY-MM-DD')),
  ];

  const isWorkingToday = !!today?.session_start_at; // 현재 열린 세션 = 근무 중
  const hasStarted = !!today?.clock_in_at;           // 오늘 한 번이라도 출근함

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">내 근태</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          기준 근무 {policy.standard_start.slice(0, 5)}~{policy.standard_end.slice(0, 5)} · 휴게 {policy.break_minutes}분
        </p>
      </div>

      {/* 오늘 카드 */}
      <div className="rounded-xl border bg-white p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full',
              isWorkingToday ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500',
            )}>
              <Clock size={22} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{dayjs().format('M월 D일')} ({DAY_LABELS[dayjs().day()]})</p>
              <p className="text-sm text-gray-500">
                {!hasStarted && '아직 출근 전입니다'}
                {hasStarted && (
                  <>
                    출근 {dayjs(today!.clock_in_at!).format('HH:mm')}
                    {isWorkingToday
                      ? <> · 근무 중 ({WORK_TYPE_LABEL[today!.work_type]})</>
                      : <> · 퇴근 {dayjs(today!.clock_out_at!).format('HH:mm')} · 근무 {fmtMinutes(today!.worked_minutes)}</>}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isWorkingToday ? (
              <Button onClick={handleClockOut} disabled={isPending} variant="outline" className="h-11 px-5">
                <LogOut size={16} className="mr-1.5" /> 퇴근
              </Button>
            ) : (
              <>
                <Select value={workType} onValueChange={(v) => setWorkType(v as typeof workType)}>
                  <SelectTrigger className="w-[100px] h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="office">사무실</SelectItem>
                    <SelectItem value="remote">재택</SelectItem>
                    <SelectItem value="field">외근</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleClockIn} disabled={isPending} className="h-11 px-5">
                  {hasStarted
                    ? <><RotateCcw size={16} className="mr-1.5" /> 재출근</>
                    : <><LogIn size={16} className="mr-1.5" /> 출근</>}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 이번주 집계 */}
      <div className="rounded-xl border bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">이번주 근무시간 ({dayjs(weekly.weekStart).format('M/D')}~)</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmtMinutes(weekly.totalMinutes)}</p>
          </div>
          {weekly.weeklyMaxMinutes != null && (
            <div className="text-right">
              <p className="text-sm text-gray-500">회사 설정 임계 {fmtMinutes(weekly.weeklyMaxMinutes)}</p>
              {weekly.overLimit ? (
                <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-amber-600">
                  <AlertTriangle size={14} /> 임계 초과 — 확인 필요
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-gray-400">임계 이내</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 월 캘린더 */}
      <div className="rounded-xl border bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">{month.format('YYYY년 M월')}</h2>
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
            const rec = recordMap.get(date);
            const leave = leaveOn(date);
            const holiday = holidayMap.get(date);
            const isWorkDay = policy.work_days.includes(d.day()) && !holiday;
            const isToday = date === dayjs().format('YYYY-MM-DD');
            return (
              <div
                key={date}
                className={cn(
                  'min-h-[64px] rounded-lg border p-1.5 text-left',
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
                {holiday && <p className="mt-0.5 text-[10px] text-red-500 truncate">{holiday}</p>}
                {leave && <p className="mt-0.5 text-[10px] font-medium text-sky-600 truncate">{leave.leave_types?.name ?? '휴가'}</p>}
                {rec?.worked_minutes != null && (
                  <p className="mt-0.5 text-[10px] text-gray-600">
                    {Math.floor(rec.worked_minutes / 60)}h {rec.worked_minutes % 60}m
                  </p>
                )}
                {rec?.clock_in_at && rec.worked_minutes == null && (
                  <p className="mt-0.5 text-[10px] text-emerald-600">근무중</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
