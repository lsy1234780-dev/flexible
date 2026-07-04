'use client';

// 내 근태 — 출퇴근 버튼 + 이번주 집계 + 월 캘린더.
// 원칙: 기록과 산수만 보여준다. "초과"는 회사 설정 임계에 대한 알림이지 위반 판정이 아니다.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Clock, LogIn, LogOut, RotateCcw, ChevronLeft, ChevronRight, AlertTriangle, Moon, Plus, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  clockIn, clockOut, getMyMonthRecords, getHolidays,
  type AttendancePolicy, type AttendanceRecord, type WeeklySummary,
} from '@/actions/attendance';
import { getMyLeaveRequests, type LeaveRequest } from '@/actions/leaves';
import { requestOvertime, cancelOvertime, type OvertimeRequest } from '@/actions/overtime';
import { decideApproval, type Approval } from '@/actions/approvals';
import type { WorkspaceMember } from '@/actions/chat';

const OT_STATUS_BADGE: Record<OvertimeRequest['status'], { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: '승인', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: '반려', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: '취소', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
};

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
  myOvertime: OvertimeRequest[];
  overtimeApprovals: Approval[];
  members: WorkspaceMember[];
}

export default function AttendanceClient({
  policy, initialToday, initialMonthRecords, initialWeekly, initialHolidays, initialLeaves,
  myOvertime, overtimeApprovals, members,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [workType, setWorkType] = useState<'office' | 'remote' | 'field'>('office');
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [records, setRecords] = useState(initialMonthRecords);
  const [holidays, setHolidays] = useState(initialHolidays);
  const [leaves, setLeaves] = useState(initialLeaves);

  // 초과근무 신청 폼
  const [otOpen, setOtOpen] = useState(false);
  const [otDate, setOtDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [otStart, setOtStart] = useState(policy.standard_end.slice(0, 5));
  const [otEnd, setOtEnd] = useState('21:00');
  const [otReason, setOtReason] = useState('');
  const [otApproverId, setOtApproverId] = useState('');

  // 반려 다이얼로그 (초과근무 승인용)
  const [decideTarget, setDecideTarget] = useState<Approval | null>(null);
  const [decisionNote, setDecisionNote] = useState('');

  function submitOvertime() {
    const approver = members.find((m) => m.user_id === otApproverId);
    if (!approver) { toast.error('승인자를 선택하세요'); return; }
    startTransition(async () => {
      const res = await requestOvertime({
        workDate: otDate,
        startTime: otStart,
        endTime: otEnd,
        reason: otReason,
        approverId: approver.user_id,
        approverName: approver.name,
      });
      if (res?.error) { toast.error(res.error); return; }
      toast.success('초과근무를 신청했습니다 — 승인자에게 알림이 전송되었습니다');
      setOtOpen(false);
      router.refresh();
    });
  }

  function cancelOt(id: string) {
    if (!confirm('이 신청을 취소하시겠습니까?')) return;
    startTransition(async () => {
      const res = await cancelOvertime(id);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('취소되었습니다');
      router.refresh();
    });
  }

  function decideOt(approval: Approval, decision: 'approved' | 'rejected', note: string) {
    startTransition(async () => {
      const res = await decideApproval(approval.id, decision, note);
      if (res?.error) { toast.error(res.error); return; }
      toast.success(decision === 'approved' ? '승인했습니다' : '반려했습니다');
      setDecideTarget(null);
      setDecisionNote('');
      router.refresh();
    });
  }

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

      {/* 내가 승인할 초과근무 */}
      {overtimeApprovals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 text-sm mb-2">
            <CheckCircle2 size={15} className="text-amber-600" /> 내가 승인할 초과근무 ({overtimeApprovals.length})
          </h2>
          <div className="space-y-2">
            {overtimeApprovals.map((a) => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border bg-white p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.entity_label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {a.requested_by_name} · {dayjs(a.created_at).format('M/D HH:mm')} 요청
                    {a.note && <> · &quot;{a.note}&quot;</>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={isPending} onClick={() => decideOt(a, 'approved', '')}>승인</Button>
                  <Button size="sm" variant="outline" disabled={isPending}
                    onClick={() => { setDecideTarget(a); setDecisionNote(''); }}>
                    반려
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 초과근무 사전 신청 */}
      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 text-sm">
            <Moon size={15} /> 초과근무 신청 ({dayjs().year()}년)
          </h2>
          <Button size="sm" variant="outline" onClick={() => {
            setOtDate(dayjs().format('YYYY-MM-DD'));
            setOtStart(policy.standard_end.slice(0, 5));
            setOtEnd('21:00');
            setOtReason('');
            setOtApproverId('');
            setOtOpen(true);
          }}>
            <Plus size={14} className="mr-1" /> 신청
          </Button>
        </div>
        {myOvertime.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            신청한 초과근무가 없습니다 — 사전 신청하면 승인 기록이 남고 월 집계·CSV에 포함됩니다
          </p>
        ) : (
          <div className="divide-y">
            {myOvertime.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {dayjs(o.work_date).format('M/D')} ({DAY_LABELS[dayjs(o.work_date).day()]}) ·{' '}
                    {dayjs(o.start_at).format('HH:mm')}~{dayjs(o.end_at).format('HH:mm')}
                    <span className="text-gray-500 font-normal"> ({fmtMinutes(o.planned_minutes)})</span>
                  </p>
                  {o.reason && <p className="text-xs text-gray-500 mt-0.5 truncate">{o.reason}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', OT_STATUS_BADGE[o.status].cls)}>
                    {OT_STATUS_BADGE[o.status].label}
                  </span>
                  {o.status === 'pending' && (
                    <Button size="sm" variant="ghost" className="text-gray-400" disabled={isPending} onClick={() => cancelOt(o.id)}>
                      취소
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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

      {/* 초과근무 신청 다이얼로그 */}
      <Dialog open={otOpen} onOpenChange={setOtOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>초과근무 사전 신청</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>날짜</Label>
              <Input type="date" value={otDate} onChange={(e) => setOtDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>시작</Label>
                <Input type="time" value={otStart} onChange={(e) => setOtStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>종료</Label>
                <Input type="time" value={otEnd} onChange={(e) => setOtEnd(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              종료가 시작보다 이르면 다음날 새벽으로 처리됩니다 (예: 22:00~01:00)
            </p>
            <div className="space-y-1.5">
              <Label>사유</Label>
              <Textarea rows={2} value={otReason} onChange={(e) => setOtReason(e.target.value)} placeholder="예: 월말 마감 대응" />
            </div>
            <div className="space-y-1.5">
              <Label>승인자</Label>
              <Select value={otApproverId} onValueChange={setOtApproverId}>
                <SelectTrigger><SelectValue placeholder="승인자 선택" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.name}{m.department && ` · ${m.department}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOtOpen(false)}>닫기</Button>
            <Button onClick={submitOvertime} disabled={isPending || !otApproverId}>신청</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 초과근무 반려 다이얼로그 */}
      <Dialog open={!!decideTarget} onOpenChange={(v) => !v && setDecideTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>반려 사유</DialogTitle></DialogHeader>
          <Textarea rows={3} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="반려 사유를 입력하세요" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideTarget(null)}>닫기</Button>
            <Button variant="destructive" disabled={isPending}
              onClick={() => decideTarget && decideOt(decideTarget, 'rejected', decisionNote)}>
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
