'use client';

// 인박스 상단 "내 근태" 워크플로우 — 로그인 후 첫 화면에서 바로 출퇴근을 찍는다.
// /attendance 페이지의 오늘 카드를 컴팩트하게 옮긴 것. 기록·산수만, 판정 없음.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Clock, LogIn, LogOut, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clockIn, clockOut, type AttendancePolicy, type AttendanceRecord, type WeeklySummary } from '@/actions/attendance';

const WORK_TYPE_LABEL: Record<string, string> = { office: '사무실', remote: '재택', field: '외근' };
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function fmtMinutes(min: number | null | undefined): string {
  if (min == null) return '-';
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}

export interface InboxAttendanceData {
  policy: AttendancePolicy;
  today: AttendanceRecord | null;
  weekly: WeeklySummary;
}

export default function InboxAttendance({ data }: { data: InboxAttendanceData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [workType, setWorkType] = useState<'office' | 'remote' | 'field'>('office');

  const { policy, today, weekly } = data;
  const isWorkingToday = !!today?.clock_in_at && !today?.clock_out_at;

  function handleClockIn() {
    startTransition(async () => {
      const res = await clockIn(workType);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('출근 처리되었습니다');
      router.refresh();
    });
  }

  function handleClockOut() {
    if (!confirm('퇴근 처리하시겠습니까?')) return;
    startTransition(async () => {
      const res = await clockOut();
      if (res?.error) { toast.error(res.error); return; }
      toast.success('퇴근 처리되었습니다');
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* 왼쪽: 오늘 상태 */}
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full',
            isWorkingToday ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500',
          )}>
            <Clock size={22} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">
              오늘 {dayjs().format('M월 D일')} ({DAY_LABELS[dayjs().day()]})
            </p>
            <p className="text-sm text-gray-500">
              {today?.clock_in_at ? (
                <>
                  출근 {dayjs(today.clock_in_at).format('HH:mm')}
                  {today.clock_out_at
                    ? <> · 퇴근 {dayjs(today.clock_out_at).format('HH:mm')} · 근무 {fmtMinutes(today.worked_minutes)}</>
                    : <> · 근무 중 ({WORK_TYPE_LABEL[today.work_type]})</>}
                </>
              ) : '아직 출근 전입니다'}
            </p>
          </div>
        </div>

        {/* 오른쪽: 출퇴근 액션 */}
        <div className="flex items-center gap-2">
          {!today?.clock_in_at && (
            <>
              <Select value={workType} onValueChange={(v) => setWorkType(v as typeof workType)}>
                <SelectTrigger className="h-10 w-[96px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">사무실</SelectItem>
                  <SelectItem value="remote">재택</SelectItem>
                  <SelectItem value="field">외근</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleClockIn} disabled={isPending} className="h-10 px-5">
                <LogIn size={16} className="mr-1.5" /> 출근
              </Button>
            </>
          )}
          {isWorkingToday && (
            <Button onClick={handleClockOut} disabled={isPending} variant="outline" className="h-10 px-5">
              <LogOut size={16} className="mr-1.5" /> 퇴근
            </Button>
          )}
          {today?.clock_out_at && (
            <span className="text-sm text-gray-400">오늘 근무 종료</span>
          )}
        </div>
      </div>

      {/* 하단: 이번주 집계 + 상세 링크 */}
      <div className="mt-3 flex items-center justify-between border-t pt-3">
        <p className="text-xs text-gray-500">
          이번주 <b className="text-gray-800">{fmtMinutes(weekly.totalMinutes)}</b>
          {weekly.weeklyMaxMinutes != null && (
            weekly.overLimit ? (
              <span className="ml-2 inline-flex items-center gap-0.5 font-medium text-amber-600">
                <AlertTriangle size={12} /> 임계 {fmtMinutes(weekly.weeklyMaxMinutes)} 초과
              </span>
            ) : (
              <span className="ml-2 text-gray-400">/ 임계 {fmtMinutes(weekly.weeklyMaxMinutes)} 이내</span>
            )
          )}
        </p>
        <button
          onClick={() => router.push('/attendance')}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          내 근태 <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
