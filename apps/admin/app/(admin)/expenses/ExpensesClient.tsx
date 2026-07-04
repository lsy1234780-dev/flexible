'use client';

// 내 경비 — 목록 + 새 신청(draft 생성 후 상세로 이동) + 지급 수령확인 배너.
// 돈 받을 사람이 자기 상태를 본다 = 미지급 방치를 막는 가장 강력한 감시자 (HR.md §5.6).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Plus, Receipt, Banknote, CircleCheck, CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createClaim, confirmReceiptMoney, disputeReceipt,
  type ExpenseClaim,
} from '@/actions/expenses';

export const STATUS_BADGE: Record<ExpenseClaim['status'], { label: string; cls: string }> = {
  draft: { label: '작성 중', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  pending: { label: '결재 대기', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: '승인', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: '반려', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: '취소', cls: 'bg-gray-50 text-gray-400 border-gray-200' },
};

export function settleBadge(c: ExpenseClaim): { label: string; cls: string } | null {
  if (c.claim_kind === 'corporate_card' || c.status !== 'approved') return null;
  if (c.settle_status === 'paid') {
    if (c.confirm_status === 'confirmed') return { label: '지급·수령확인', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (c.confirm_status === 'auto_closed') return { label: '지급·미이의 마감', cls: 'bg-blue-50 text-blue-600 border-blue-200' };
    if (c.confirm_status === 'disputed') return { label: '이의제기 중', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
    return { label: '지급됨·확인 대기', cls: 'bg-sky-50 text-sky-700 border-sky-200' };
  }
  return { label: '지급 대기', cls: 'bg-orange-50 text-orange-700 border-orange-200' };
}

interface Props {
  claims: ExpenseClaim[];
  awaiting: ExpenseClaim[];
}

export default function ExpensesClient({ claims, awaiting }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'reimbursement' | 'corporate_card'>('reimbursement');

  const [disputeTarget, setDisputeTarget] = useState<ExpenseClaim | null>(null);
  const [disputeNote, setDisputeNote] = useState('');

  function submit() {
    startTransition(async () => {
      const res = await createClaim(title, kind);
      if ('error' in res && res.error) { toast.error(res.error); return; }
      toast.success('경비 신청을 만들었습니다 — 라인을 추가하세요');
      setOpen(false);
      if ('id' in res) router.push(`/expenses/${res.id}`);
    });
  }

  function confirm(c: ExpenseClaim) {
    startTransition(async () => {
      const res = await confirmReceiptMoney(c.id);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('수령 확인되었습니다');
      router.refresh();
    });
  }

  function dispute() {
    if (!disputeTarget) return;
    startTransition(async () => {
      const res = await disputeReceipt(disputeTarget.id, disputeNote);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('이의제기가 접수되었습니다 — 담당자에게 알림이 전송됩니다');
      setDisputeTarget(null);
      setDisputeNote('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">내 경비</h1>
          <p className="text-sm text-gray-500 mt-0.5">경비 청구 → 결재 → 지급 확인</p>
        </div>
        <Button onClick={() => { setTitle(''); setKind('reimbursement'); setOpen(true); }}>
          <Plus size={16} className="mr-1" /> 새 경비
        </Button>
      </div>

      {/* 지급 확인 배너 */}
      {awaiting.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-800">
            <Banknote size={15} /> 지급 확인이 필요합니다 ({awaiting.length}건)
          </p>
          {awaiting.map((c) => {
            const dleft = c.confirm_due_at
              ? Math.max(0, Math.ceil((new Date(c.confirm_due_at).getTime() - Date.now()) / 86400000))
              : null;
            return (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border bg-white p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {c.title} · {Number(c.total_amount).toLocaleString()}원
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.paid_at && `${dayjs(c.paid_at).format('M/D')} 이체됨`}
                    {dleft != null && ` · D-${dleft} (무응답 시 미이의 마감으로 기록)`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={isPending} onClick={() => confirm(c)}>
                    <CircleCheck size={14} className="mr-1" /> 받았습니다
                  </Button>
                  <Button size="sm" variant="outline" disabled={isPending}
                    onClick={() => { setDisputeTarget(c); setDisputeNote(''); }}>
                    <CircleAlert size={14} className="mr-1" /> 이의제기
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 목록 */}
      <div className="rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 text-sm">
            <Receipt size={15} /> 신청 내역
          </h2>
        </div>
        {claims.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">아직 신청한 경비가 없습니다</p>
        ) : (
          <div className="divide-y">
            {claims.map((c) => {
              const sb = settleBadge(c);
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/expenses/${c.id}`)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {dayjs(c.created_at).format('M/D')} · {Number(c.total_amount).toLocaleString()}원
                      {c.claim_kind === 'corporate_card' && ' · 법인카드'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {sb && (
                      <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', sb.cls)}>
                        {sb.label}
                      </span>
                    )}
                    <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_BADGE[c.status].cls)}>
                      {STATUS_BADGE[c.status].label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 새 경비 다이얼로그 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>새 경비 신청</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>제목</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 7월 출장 경비" />
            </div>
            <div className="space-y-1.5">
              <Label>구분</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reimbursement">개인 경비 (환급)</SelectItem>
                  <SelectItem value="corporate_card">법인카드 (증빙만)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>닫기</Button>
            <Button onClick={submit} disabled={isPending || !title.trim()}>만들기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 이의제기 다이얼로그 */}
      <Dialog open={!!disputeTarget} onOpenChange={(v) => !v && setDisputeTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>이의제기</DialogTitle></DialogHeader>
          <p className="text-xs text-gray-500">입금이 안 됐거나 금액이 다른 경우 사유를 남겨주세요. 담당자가 확인 후 재처리합니다.</p>
          <Textarea rows={3} value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} placeholder="예: 아직 입금이 확인되지 않았습니다" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeTarget(null)}>닫기</Button>
            <Button variant="destructive" onClick={dispute} disabled={isPending || !disputeNote.trim()}>제출</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
