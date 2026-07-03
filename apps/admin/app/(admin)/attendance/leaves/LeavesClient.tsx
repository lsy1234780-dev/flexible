'use client';

// 휴가 — 잔여 현황(부여는 관리자 입력) + 신청(approvals 결재 연동) + 내가 승인할 휴가.
// 신청 시 같은 기간에 이미 휴가인 팀원을 보여줘 팀 전원이 같은 날 비는 사고를 방지한다.

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { CalendarDays, Plus, CheckCircle2, XCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  requestLeave, cancelLeaveRequest, previewLeaveDays, getTeamLeaves,
  type LeaveType, type LeaveRequest, type LeaveBalance, type TeamLeaveItem,
} from '@/actions/leaves';
import { decideApproval, type Approval } from '@/actions/approvals';
import type { WorkspaceMember } from '@/actions/chat';

const STATUS_BADGE: Record<LeaveRequest['status'], { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: '승인', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: '반려', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: '취소', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
};

interface Props {
  types: LeaveType[];
  balance: LeaveBalance;
  requests: LeaveRequest[];
  leaveApprovals: Approval[];
  members: WorkspaceMember[];
}

export default function LeavesClient({ types, balance, requests, leaveApprovals, members }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 신청 폼
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [startDate, setStartDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [reason, setReason] = useState('');
  const [approverId, setApproverId] = useState('');
  const [days, setDays] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<TeamLeaveItem[]>([]);

  // 반려 다이얼로그
  const [decideTarget, setDecideTarget] = useState<Approval | null>(null);
  const [decisionNote, setDecisionNote] = useState('');

  // 날짜/종류가 바뀌면 일수 미리보기 + 같은 기간 부재자 조회
  useEffect(() => {
    if (!open || !typeId || !startDate || !endDate || dayjs(endDate).isBefore(dayjs(startDate))) return;
    let stale = false;
    previewLeaveDays(startDate, endDate, typeId).then((d) => { if (!stale) setDays(d); });
    getTeamLeaves(startDate, endDate).then((items) => { if (!stale) setConflicts(items); });
    return () => { stale = true; };
  }, [open, typeId, startDate, endDate]);

  function openForm() {
    setTypeId(types[0]?.id ?? '');
    setStartDate(dayjs().format('YYYY-MM-DD'));
    setEndDate(dayjs().format('YYYY-MM-DD'));
    setReason('');
    setApproverId('');
    setDays(null);
    setConflicts([]);
    setOpen(true);
  }

  function submit() {
    const approver = members.find((m) => m.user_id === approverId);
    if (!typeId) { toast.error('휴가 종류를 선택하세요'); return; }
    if (!approver) { toast.error('승인자를 선택하세요'); return; }
    startTransition(async () => {
      const res = await requestLeave({
        leaveTypeId: typeId,
        startDate,
        endDate,
        reason,
        approverId: approver.user_id,
        approverName: approver.name,
      });
      if (res?.error) { toast.error(res.error); return; }
      toast.success('휴가를 신청했습니다 — 승인자에게 알림이 전송되었습니다');
      setOpen(false);
      router.refresh();
    });
  }

  function cancel(id: string) {
    if (!confirm('이 신청을 취소하시겠습니까?')) return;
    startTransition(async () => {
      const res = await cancelLeaveRequest(id);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('취소되었습니다');
      router.refresh();
    });
  }

  function decide(approval: Approval, decision: 'approved' | 'rejected', note: string) {
    startTransition(async () => {
      const res = await decideApproval(approval.id, decision, note);
      if (res?.error) { toast.error(res.error); return; }
      toast.success(decision === 'approved' ? '승인했습니다' : '반려했습니다');
      setDecideTarget(null);
      setDecisionNote('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">휴가</h1>
          <p className="text-sm text-gray-500 mt-0.5">신청은 지정한 승인자의 결재를 거칩니다</p>
        </div>
        <Button onClick={openForm}><Plus size={16} className="mr-1" /> 휴가 신청</Button>
      </div>

      {/* 잔여 카드 — "부여 (관리자 입력)" 중립 라벨 (법정 아님) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">부여 (관리자 입력)</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{balance.granted}일</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">사용 (승인 기준)</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{balance.used}일</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">잔여</p>
          <p className={cn('text-lg font-bold mt-1', balance.remaining < 0 ? 'text-rose-600' : 'text-gray-900')}>
            {balance.remaining}일
          </p>
        </div>
      </div>

      {/* 내가 승인할 휴가 */}
      {leaveApprovals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 text-sm mb-2">
            <CheckCircle2 size={15} className="text-amber-600" /> 내가 승인할 휴가 ({leaveApprovals.length})
          </h2>
          <div className="space-y-2">
            {leaveApprovals.map((a) => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border bg-white p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.entity_label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {a.requested_by_name} · {dayjs(a.created_at).format('M/D HH:mm')} 요청
                    {a.note && <> · &quot;{a.note}&quot;</>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={isPending} onClick={() => decide(a, 'approved', '')}>
                    승인
                  </Button>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => { setDecideTarget(a); setDecisionNote(''); }}>
                    반려
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 내 신청 목록 */}
      <div className="rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 text-sm">
            <CalendarDays size={15} /> 내 신청 ({dayjs().year()}년)
          </h2>
        </div>
        {requests.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">아직 신청한 휴가가 없습니다</p>
        ) : (
          <div className="divide-y">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {r.leave_types?.name ?? '휴가'} · {dayjs(r.start_date).format('M/D')}
                    {r.start_date !== r.end_date && <>~{dayjs(r.end_date).format('M/D')}</>}
                    <span className="text-gray-500 font-normal"> ({r.days}일)</span>
                  </p>
                  {r.reason && <p className="text-xs text-gray-500 mt-0.5 truncate">{r.reason}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_BADGE[r.status].cls)}>
                    {STATUS_BADGE[r.status].label}
                  </span>
                  {r.status === 'pending' && (
                    <Button size="sm" variant="ghost" className="text-gray-400 h-7" disabled={isPending} onClick={() => cancel(r.id)}>
                      취소
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 신청 다이얼로그 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>휴가 신청</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>종류</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger><SelectValue placeholder="휴가 종류" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{!t.deducts_annual && ' (연차 차감 없음)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>시작일</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>종료일</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            {days != null && (
              <p className="text-sm text-gray-600">
                차감 일수: <b>{days}일</b> <span className="text-gray-400">(주말·공휴일 제외 산수)</span>
              </p>
            )}
            {conflicts.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="flex items-center gap-1 text-xs font-medium text-amber-700 mb-1">
                  <Users size={12} /> 같은 기간에 자리 비움
                </p>
                <div className="space-y-0.5">
                  {conflicts.map((c) => (
                    <p key={c.id} className="text-xs text-amber-800">
                      {c.user_name ?? '팀원'} · {c.type_name} {dayjs(c.start_date).format('M/D')}
                      {c.start_date !== c.end_date && <>~{dayjs(c.end_date).format('M/D')}</>}
                      {c.status === 'pending' && ' (승인 대기)'}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>승인자</Label>
              <Select value={approverId} onValueChange={setApproverId}>
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
            <div className="space-y-1.5">
              <Label>사유 (선택)</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 개인 사유" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>닫기</Button>
            <Button onClick={submit} disabled={isPending}>신청</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 반려 사유 다이얼로그 */}
      <Dialog open={!!decideTarget} onOpenChange={(v) => !v && setDecideTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>반려 사유</DialogTitle></DialogHeader>
          <Textarea rows={3} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="반려 사유를 입력하세요" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideTarget(null)}>닫기</Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => decideTarget && decide(decideTarget, 'rejected', decisionNote)}
            >
              <XCircle size={15} className="mr-1" /> 반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
