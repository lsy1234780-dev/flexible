'use client';

// 승인 워크플로우 UI — 수주 확정(OrderDetailClient) / 구매발주 확정(PurchaseOrderDetailClient)이 공유.
// 담당자를 건별로 지정하는 방식: 요청 → 지정된 승인자만 승인/반려 가능 → 승인되면 확정 액션이 풀린다.

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getWorkspaceMembers, type WorkspaceMember } from '@/actions/chat';
import { getCurrentUser } from '@/actions/auth';
import { getApprovalStatus, requestApproval, decideApproval, type Approval } from '@/actions/approvals';

interface Props {
  entityType: string;
  entityId: string;
  entityLabel: string;
  /** 승인 상태가 바뀐 뒤(요청/승인/반려) 부모가 다시 조회하고 싶을 때 */
  onChange?: () => void;
}

export default function ApprovalPanel({ entityType, entityId, entityLabel, onChange }: Props) {
  const [approval, setApproval] = useState<Approval | null | undefined>(undefined);
  const [me, setMe] = useState<{ id: string | null }>({ id: null });
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [approverId, setApproverId] = useState('');
  const [note, setNote] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [isPending, startTransition] = useTransition();

  function load() {
    getApprovalStatus(entityType, entityId).then(setApproval);
  }

  useEffect(() => {
    load();
    getCurrentUser().then((u) => setMe({ id: u?.id ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  function openRequestDialog() {
    if (members.length === 0) getWorkspaceMembers().then(setMembers);
    setApproverId('');
    setNote('');
    setRequestOpen(true);
  }

  function submitRequest() {
    const approver = members.find((m) => m.user_id === approverId);
    if (!approver) { toast.error('승인자를 선택하세요'); return; }
    startTransition(async () => {
      const res = await requestApproval(entityType, entityId, entityLabel, approver.user_id, approver.name, note);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('승인을 요청했습니다');
      setRequestOpen(false);
      load();
      onChange?.();
    });
  }

  function decide(decision: 'approved' | 'rejected') {
    if (!approval) return;
    if (decision === 'rejected' && !confirm('반려하시겠습니까?')) return;
    startTransition(async () => {
      const res = await decideApproval(approval.id, decision, decisionNote);
      if (res?.error) { toast.error(res.error); return; }
      toast.success(decision === 'approved' ? '승인했습니다' : '반려했습니다');
      setDecisionNote('');
      load();
      onChange?.();
    });
  }

  if (approval === undefined) return null; // 로딩 중엔 깜빡임 방지 차 아무것도 안 보여줌

  const isMyApproval = approval?.status === 'pending' && approval.approver_id === me.id;

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <ShieldCheck size={15} className="text-gray-400" />
        승인
      </div>

      {!approval && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-gray-400">아직 승인 요청이 없습니다</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openRequestDialog}>승인 요청</Button>
        </div>
      )}

      {approval && approval.status === 'pending' && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-amber-600">
            <Clock size={12} />
            승인 대기중 — 담당자: {approval.approver_name}
            {approval.note && <span className="text-gray-400">· {approval.note}</span>}
          </div>
          {isMyApproval && (
            <div className="space-y-1.5">
              <Textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="반려 시 사유 등 (선택)"
                className="h-16 text-xs"
              />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 flex-1 text-xs" disabled={isPending} onClick={() => decide('approved')}>
                  <CheckCircle2 size={12} /> 승인
                </Button>
                <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-red-600 hover:text-red-700" disabled={isPending} onClick={() => decide('rejected')}>
                  <XCircle size={12} /> 반려
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {approval && approval.status === 'approved' && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 size={12} />
          {approval.approver_name} 님이 승인함
          {approval.decision_note && <span className="text-gray-400">· {approval.decision_note}</span>}
        </div>
      )}

      {approval && approval.status === 'rejected' && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <XCircle size={12} />
            {approval.approver_name} 님이 반려함
            {approval.decision_note && <span className="text-gray-400">· {approval.decision_note}</span>}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openRequestDialog}>다시 승인 요청</Button>
        </div>
      )}

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>승인 요청</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>승인자</Label>
              <Select value={approverId} onValueChange={setApproverId}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="승인자를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.name} ({m.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>메모</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="승인자에게 전달할 메모 (선택)"
                className={cn('mt-1 h-20 text-sm')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>취소</Button>
            <Button onClick={submitRequest} disabled={isPending || !approverId}>
              {isPending ? '요청 중...' : '요청 보내기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
