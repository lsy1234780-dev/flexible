'use client';

// 경비 상세 — 라인 편집(draft)·영수증 업로드·결재 요청/처리·지급 상태·레코드 스레드.
// 결재 요청은 draft→pending 전환과 approvals 생성을 묶어서(requestClaimApproval) 처리하므로
// 범용 ApprovalPanel 대신 이 화면의 커스텀 섹션을 쓴다 (결정 처리는 decideApproval 그대로 재사용).

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Trash2, Paperclip, FileDown, Send, CircleCheck, CircleAlert, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import RecordThread from '@/components/RecordThread';
import { decideApproval, type Approval } from '@/actions/approvals';
import type { WorkspaceMember } from '@/actions/chat';
import {
  addClaimItem, removeClaimItem, uploadReceipt, getReceiptUrl,
  requestClaimApproval, cancelClaim, deleteDraftClaim,
  confirmReceiptMoney, disputeReceipt,
  type ExpenseClaim, type ExpenseClaimItem, type ExpenseCategory,
} from '@/actions/expenses';
import { STATUS_BADGE, settleBadge } from '../ExpensesClient';

const METHOD_LABEL: Record<string, string> = { personal: '개인', corporate_card: '법인카드' };

interface Props {
  claim: ExpenseClaim;
  items: ExpenseClaimItem[];
  categories: ExpenseCategory[];
  approval: Approval | null;
  members: WorkspaceMember[];
  myId: string | null;
}

export default function ExpenseDetailClient({ claim, items, categories, approval, members, myId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadItemRef = useRef<string | null>(null);

  const isOwner = myId === claim.user_id;
  const isDraft = claim.status === 'draft';
  const isApprover = approval?.status === 'pending' && approval.approver_id === myId;

  // 라인 추가 폼
  const [itemOpen, setItemOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [vat, setVat] = useState('');
  const [spentAt, setSpentAt] = useState(dayjs().format('YYYY-MM-DD'));
  const [merchant, setMerchant] = useState('');
  const [method, setMethod] = useState<'personal' | 'corporate_card'>(
    claim.claim_kind === 'corporate_card' ? 'corporate_card' : 'personal',
  );
  const [memo, setMemo] = useState('');

  // 결재 요청 폼
  const [reqOpen, setReqOpen] = useState(false);
  const [approverId, setApproverId] = useState('');
  const [note, setNote] = useState('');

  // 반려 폼
  const [rejectOpen, setRejectOpen] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');

  // 이의제기 폼
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');

  function submitItem() {
    startTransition(async () => {
      const res = await addClaimItem(claim.id, {
        categoryId: categoryId || null,
        amount: parseFloat(amount) || 0,
        vatAmount: vat.trim() === '' ? null : parseFloat(vat),
        spentAt,
        merchant,
        paymentMethod: method,
        memo,
      });
      if (res?.error) { toast.error(res.error); return; }
      setItemOpen(false);
      setAmount(''); setVat(''); setMerchant(''); setMemo('');
      router.refresh();
    });
  }

  function removeItem(id: string) {
    startTransition(async () => {
      const res = await removeClaimItem(id, claim.id);
      if (res?.error) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  function pickReceipt(itemId: string) {
    uploadItemRef.current = itemId;
    fileRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const itemId = uploadItemRef.current;
    if (!file || !itemId) return;
    const fd = new FormData();
    fd.set('file', file);
    fd.set('claimId', claim.id);
    fd.set('itemId', itemId);
    startTransition(async () => {
      const res = await uploadReceipt(fd);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('영수증을 첨부했습니다');
      router.refresh();
    });
  }

  function openReceipt(path: string) {
    startTransition(async () => {
      const url = await getReceiptUrl(path);
      if (!url) { toast.error('영수증을 열 수 없습니다'); return; }
      window.open(url, '_blank');
    });
  }

  function submitRequest() {
    const approver = members.find((m) => m.user_id === approverId);
    if (!approver) { toast.error('승인자를 선택하세요'); return; }
    startTransition(async () => {
      const res = await requestClaimApproval(claim.id, approver.user_id, approver.name, note);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('결재를 요청했습니다');
      setReqOpen(false);
      router.refresh();
    });
  }

  function decide(decision: 'approved' | 'rejected', dnote: string) {
    if (!approval) return;
    startTransition(async () => {
      const res = await decideApproval(approval.id, decision, dnote);
      if (res?.error) { toast.error(res.error); return; }
      toast.success(decision === 'approved' ? '승인했습니다' : '반려했습니다');
      setRejectOpen(false);
      router.refresh();
    });
  }

  const sb = settleBadge(claim);

  return (
    <div className="space-y-4 max-w-5xl">
      {/* 숨김 파일 입력 (영수증) */}
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={onFileSelected} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button onClick={() => router.push('/expenses')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-1">
            <ArrowLeft size={12} /> 내 경비
          </button>
          <h1 className="text-xl font-bold text-gray-900 truncate">{claim.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {claim.user_name} · {dayjs(claim.created_at).format('YYYY.M.D')} ·{' '}
            {claim.claim_kind === 'reimbursement' ? '개인 경비 (환급)' : '법인카드 (증빙)'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {sb && <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', sb.cls)}>{sb.label}</span>}
          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_BADGE[claim.status].cls)}>
            {STATUS_BADGE[claim.status].label}
          </span>
        </div>
      </div>

      {/* 결재 섹션 */}
      <div className="rounded-xl border bg-white p-4">
        <h2 className="flex items-center gap-1.5 font-semibold text-gray-900 text-sm mb-2">
          <ShieldCheck size={15} /> 결재
        </h2>
        {isDraft && isOwner && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">라인 입력을 마치면 결재를 요청하세요</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-gray-400" disabled={isPending}
                onClick={() => {
                  if (!confirm('이 신청을 삭제하시겠습니까?')) return;
                  startTransition(async () => {
                    const res = await deleteDraftClaim(claim.id);
                    if (res?.error) { toast.error(res.error); return; }
                    router.push('/expenses');
                  });
                }}>
                삭제
              </Button>
              <Button size="sm" disabled={isPending || items.length === 0}
                onClick={() => { setApproverId(''); setNote(''); setReqOpen(true); }}>
                <Send size={14} className="mr-1" /> 결재 요청
              </Button>
            </div>
          </div>
        )}
        {approval && (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              승인자 <b>{approval.approver_name}</b>
              {approval.note && <> · &quot;{approval.note}&quot;</>}
              {approval.decision_note && <> · 결정: &quot;{approval.decision_note}&quot;</>}
            </p>
            {isApprover && (
              <div className="flex gap-2">
                <Button size="sm" disabled={isPending} onClick={() => decide('approved', '')}>승인</Button>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => { setDecisionNote(''); setRejectOpen(true); }}>반려</Button>
              </div>
            )}
          </div>
        )}
        {claim.status === 'pending' && isOwner && (
          <Button variant="ghost" size="sm" className="text-gray-400 mt-1" disabled={isPending}
            onClick={() => {
              if (!confirm('결재 요청을 취소하시겠습니까?')) return;
              startTransition(async () => {
                const res = await cancelClaim(claim.id);
                if (res?.error) { toast.error(res.error); return; }
                router.refresh();
              });
            }}>
            신청 취소
          </Button>
        )}
      </div>

      {/* 지급/수령확인 (환급 건, 승인 후) */}
      {claim.claim_kind === 'reimbursement' && claim.status === 'approved' && (
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-2">지급</h2>
          {claim.settle_status === 'unpaid' && <p className="text-sm text-gray-500">담당자의 정산(이체)을 기다리고 있습니다</p>}
          {claim.settle_status === 'paid' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                {claim.paid_at && <>{dayjs(claim.paid_at).format('YYYY.M.D')} 이체 처리됨</>}
                {claim.confirm_status === 'confirmed' && claim.confirmed_at && <> · {dayjs(claim.confirmed_at).format('M/D')} 본인 수령확인</>}
                {claim.confirm_status === 'auto_closed' && <> · 미이의 마감 (자동)</>}
                {claim.confirm_status === 'disputed' && <> · 이의제기 처리 중: &quot;{claim.dispute_note}&quot;</>}
              </p>
              {isOwner && claim.confirm_status === 'awaiting' && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={isPending}
                    onClick={() => startTransition(async () => {
                      const res = await confirmReceiptMoney(claim.id);
                      if (res?.error) { toast.error(res.error); return; }
                      toast.success('수령 확인되었습니다');
                      router.refresh();
                    })}>
                    <CircleCheck size={14} className="mr-1" /> 받았습니다
                  </Button>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => { setDisputeNote(''); setDisputeOpen(true); }}>
                    <CircleAlert size={14} className="mr-1" /> 이의제기
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 라인 */}
      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-900 text-sm">
            경비 라인 · 합계 <span className="text-gray-900 font-bold">{Number(claim.total_amount).toLocaleString()}원</span>
          </h2>
          <div className="flex gap-2">
            {claim.status !== 'draft' && (
              <a href={`/api/expenses/${claim.id}/statement`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                <FileDown size={13} /> 지급 내역서
              </a>
            )}
            {isDraft && isOwner && (
              <Button size="sm" onClick={() => setItemOpen(true)}><Plus size={14} className="mr-1" /> 라인 추가</Button>
            )}
          </div>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {isDraft ? '라인을 추가하세요 (택시비, 식대 등 건별로)' : '라인이 없습니다'}
          </p>
        ) : (
          <div className="divide-y">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {it.expense_categories?.name ?? '기타'} · {Number(it.amount).toLocaleString()}원
                    <span className="text-gray-400 font-normal text-xs"> ({METHOD_LABEL[it.payment_method]})</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {dayjs(it.spent_at).format('M/D')}{it.merchant && ` · ${it.merchant}`}{it.memo && ` · ${it.memo}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {it.receipt_path ? (
                    <button onClick={() => openReceipt(it.receipt_path!)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">
                      <Paperclip size={12} /> 영수증
                    </button>
                  ) : isDraft && isOwner ? (
                    <button onClick={() => pickReceipt(it.id)} className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs text-gray-400 hover:text-gray-600">
                      <Paperclip size={12} /> 첨부
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300">영수증 없음</span>
                  )}
                  {isDraft && isOwner && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400" disabled={isPending} onClick={() => removeItem(it.id)}>
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 레코드 스레드 (chat 모듈 켜져 있을 때만 내부에서 렌더) */}
      <RecordThread entityType="expense" entityId={claim.id} entityLabel={claim.title} />

      {/* 라인 추가 다이얼로그 */}
      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>경비 라인 추가</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>항목</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>사용일</Label>
                <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>금액 (원)</Label>
                <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" />
              </div>
              <div className="space-y-1.5">
                <Label>부가세 (선택)</Label>
                <Input type="number" min={0} value={vat} onChange={(e) => setVat(e.target.value)} placeholder="입력 시 표시" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>사용처</Label>
                <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="예: 카카오T" />
              </div>
              <div className="space-y-1.5">
                <Label>결제수단</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">개인</SelectItem>
                    <SelectItem value="corporate_card">법인카드</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>메모 (선택)</Label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 고객사 미팅 이동" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemOpen(false)}>닫기</Button>
            <Button onClick={submitItem} disabled={isPending || !amount}>추가</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 결재 요청 다이얼로그 */}
      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>결재 요청</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              합계 <b>{Number(claim.total_amount).toLocaleString()}원</b> · {items.length}건
              <span className="block text-xs text-gray-400 mt-0.5">요청 후에는 라인을 수정할 수 없습니다</span>
            </p>
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
              <Label>메모 (선택)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqOpen(false)}>닫기</Button>
            <Button onClick={submitRequest} disabled={isPending}>요청</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 반려 다이얼로그 */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>반려 사유</DialogTitle></DialogHeader>
          <Textarea rows={3} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="반려 사유를 입력하세요" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>닫기</Button>
            <Button variant="destructive" disabled={isPending} onClick={() => decide('rejected', decisionNote)}>반려</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 이의제기 다이얼로그 */}
      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>이의제기</DialogTitle></DialogHeader>
          <Textarea rows={3} value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} placeholder="예: 아직 입금이 확인되지 않았습니다" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeOpen(false)}>닫기</Button>
            <Button variant="destructive" disabled={isPending || !disputeNote.trim()}
              onClick={() => startTransition(async () => {
                const res = await disputeReceipt(claim.id, disputeNote);
                if (res?.error) { toast.error(res.error); return; }
                toast.success('이의제기가 접수되었습니다');
                setDisputeOpen(false);
                router.refresh();
              })}>
              제출
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
