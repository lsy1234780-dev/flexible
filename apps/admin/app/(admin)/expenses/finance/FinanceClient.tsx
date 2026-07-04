'use client';

// 정산 관리 (재무 담당 전용) — HR.md §5 B안 구현.
// 지급 대기(배치 이체) / 이의제기 처리 / 지급 완료 / 법인카드 증빙 / 경비 항목 / 담당자 관리.
// 이체는 은행에서 사람이 한다 — 여기서는 "이체했다"는 사실과 이체증만 기록한다.

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
  Banknote, CircleAlert, CircleCheck, CreditCard, Download, Paperclip, Plus, ShieldCheck, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createSettlementBatch, uploadBatchProof, renotifyAfterDispute, rollbackPayment,
  createExpenseCategory, deleteExpenseCategory,
  grantExpenseManager, revokeExpenseManager,
  type FinanceData, type ExpenseCategory, type ExpenseClaim, type ExpenseManagerRow,
} from '@/actions/expenses';
import type { WorkspaceMember } from '@/actions/chat';

const CONFIRM_LABEL: Record<ExpenseClaim['confirm_status'], { label: string; cls: string }> = {
  none: { label: '-', cls: 'text-gray-400' },
  awaiting: { label: '확인 대기', cls: 'text-sky-600' },
  confirmed: { label: '본인 확인', cls: 'text-emerald-600' },
  disputed: { label: '이의제기', cls: 'text-rose-600' },
  auto_closed: { label: '미이의 마감', cls: 'text-gray-500' },
};

type Tab = 'toPay' | 'disputed' | 'paid' | 'corporate' | 'categories' | 'managers';

interface Props {
  finance: FinanceData;
  categories: ExpenseCategory[];
  managers: ExpenseManagerRow[];
  members: WorkspaceMember[];
}

export default function FinanceClient({ finance, categories, managers, members }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>('toPay');

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'toPay', label: '지급 대기', count: finance.toPay.length },
    { key: 'disputed', label: '이의제기', count: finance.disputed.length },
    { key: 'paid', label: '지급 완료' },
    { key: 'corporate', label: '법인카드' },
    { key: 'categories', label: '경비 항목' },
    { key: 'managers', label: '담당자' },
  ];

  // 지급 대기 — 선택 + 배치 다이얼로그
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchTitle, setBatchTitle] = useState('');
  const [transferDate, setTransferDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [batchNote, setBatchNote] = useState('');
  const proofRef = useRef<HTMLInputElement>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  // 경비 항목 폼
  const [catName, setCatName] = useState('');

  // 담당자 추가
  const [newManagerId, setNewManagerId] = useState('');

  // CSV export 월 선택
  const [exportMonth, setExportMonth] = useState(dayjs().format('YYYY-MM'));

  const selectedClaims = finance.toPay.filter((c) => selected.has(c.id));
  const selectedTotal = selectedClaims.reduce((s, c) => s + Number(c.total_amount), 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openBatch() {
    if (selected.size === 0) { toast.error('지급할 경비를 선택하세요'); return; }
    setBatchTitle(`${dayjs().format('YYYY년 M월')} 경비 정산`);
    setTransferDate(dayjs().format('YYYY-MM-DD'));
    setBatchNote('');
    setProofFile(null);
    setBatchOpen(true);
  }

  function submitBatch() {
    startTransition(async () => {
      let proofPath: string | null = null;
      let proofName: string | null = null;
      if (proofFile) {
        const fd = new FormData();
        fd.append('file', proofFile);
        const up = await uploadBatchProof(fd);
        if ('error' in up && up.error) { toast.error(up.error); return; }
        if ('path' in up) { proofPath = up.path ?? null; proofName = up.name ?? null; }
      }
      const res = await createSettlementBatch({
        title: batchTitle,
        transferDate,
        note: batchNote,
        claimIds: [...selected],
        proofPath,
        proofName,
      });
      if (res?.error) { toast.error(res.error); return; }
      toast.success(`${selected.size}건 지급 처리했습니다 — 직원에게 수령 확인이 요청됩니다`);
      setBatchOpen(false);
      setSelected(new Set());
      router.refresh();
    });
  }

  function renotify(c: ExpenseClaim) {
    startTransition(async () => {
      const res = await renotifyAfterDispute(c.id);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('재통지했습니다 — 확인 기한이 다시 시작됩니다');
      router.refresh();
    });
  }

  function rollback(c: ExpenseClaim) {
    if (!confirm(`「${c.title}」 지급 처리를 취소하고 지급 대기로 되돌리시겠습니까?`)) return;
    startTransition(async () => {
      const res = await rollbackPayment(c.id);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('지급 대기로 되돌렸습니다');
      router.refresh();
    });
  }

  function addCategory() {
    if (!catName.trim()) { toast.error('항목 이름을 입력하세요'); return; }
    startTransition(async () => {
      const res = await createExpenseCategory(catName);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('경비 항목을 추가했습니다');
      setCatName('');
      router.refresh();
    });
  }

  function addManager() {
    if (!newManagerId) { toast.error('멤버를 선택하세요'); return; }
    startTransition(async () => {
      const res = await grantExpenseManager(newManagerId);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('재무 담당 권한을 부여했습니다');
      setNewManagerId('');
      router.refresh();
    });
  }

  function removeManager(m: ExpenseManagerRow) {
    if (!confirm(`${m.name} 님의 재무 담당 권한을 회수하시겠습니까?`)) return;
    startTransition(async () => {
      const res = await revokeExpenseManager(m.user_id);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('권한을 회수했습니다');
      router.refresh();
    });
  }

  const nonManagerMembers = members.filter((m) => !managers.some((g) => g.user_id === m.user_id));

  function ClaimRow({ c, children }: { c: ExpenseClaim; children?: React.ReactNode }) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2.5">
        <button className="min-w-0 text-left" onClick={() => router.push(`/expenses/${c.id}`)}>
          <p className="text-sm font-medium text-gray-900 truncate hover:underline">
            {c.title} · {Number(c.total_amount).toLocaleString()}원
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {c.user_name ?? '-'} · {dayjs(c.created_at).format('M/D')} 신청
          </p>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">정산 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">승인된 경비의 지급 처리와 수령 확인을 관리합니다</p>
        </div>
        {/* CSV export — 지출일 기준 라인 단위 (회계 분개·증빙 대조용) */}
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={exportMonth}
            onChange={(e) => setExportMonth(e.target.value)}
            className="h-9 rounded-md border px-2 text-sm text-gray-700"
          />
          <a
            href={`/api/expenses/export?year=${exportMonth.slice(0, 4)}&month=${parseInt(exportMonth.slice(5, 7), 10)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download size={14} /> CSV
          </a>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600',
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cn(
                'rounded-full px-1.5 text-[11px] font-semibold',
                t.key === 'disputed' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600',
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── 지급 대기 ── */}
      {tab === 'toPay' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="text-xs text-gray-500">
            승인 완료된 환급 대상입니다. 은행에서 이체를 마친 뒤, 이체한 건을 선택해 지급 처리하세요.
          </p>
          {finance.toPay.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">지급 대기 중인 경비가 없습니다</p>
          ) : (
            <>
              <div className="divide-y">
                {finance.toPay.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <div className="flex-1 min-w-0">
                      <ClaimRow c={c} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                <p className="text-sm text-gray-600">
                  {selected.size}건 선택
                  {selected.size > 0 && <b className="text-gray-900"> · {selectedTotal.toLocaleString()}원</b>}
                </p>
                <Button onClick={openBatch} disabled={isPending || selected.size === 0}>
                  <Banknote size={15} className="mr-1" /> 지급 처리
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 이의제기 ── */}
      {tab === 'disputed' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="text-xs text-gray-500">
            직원이 &ldquo;입금이 안 됐거나 금액이 다르다&rdquo;고 알린 건입니다. 확인 후
            재이체했으면 <b>재통지</b>, 이체 기록 자체가 잘못됐으면 <b>지급 취소</b>로 되돌리세요.
          </p>
          {finance.disputed.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">이의제기된 경비가 없습니다</p>
          ) : (
            <div className="divide-y">
              {finance.disputed.map((c) => (
                <div key={c.id} className="py-2.5 space-y-2">
                  <ClaimRow c={c}>
                    <Button size="sm" variant="outline" disabled={isPending} onClick={() => renotify(c)}>
                      <CircleCheck size={14} className="mr-1" /> 재통지
                    </Button>
                    <Button size="sm" variant="ghost" className="text-gray-500" disabled={isPending} onClick={() => rollback(c)}>
                      지급 취소
                    </Button>
                  </ClaimRow>
                  {c.dispute_note && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <CircleAlert size={13} className="flex-shrink-0 mt-0.5" /> {c.dispute_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 지급 완료 ── */}
      {tab === 'paid' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="text-xs text-gray-500">
            최근 지급 처리된 경비입니다. 직원이 14일 내 응답하지 않으면 &ldquo;미이의 마감&rdquo;으로
            기록됩니다 (수령 확인과는 구분해 남깁니다).
          </p>
          {finance.paid.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">지급 완료된 경비가 없습니다</p>
          ) : (
            <div className="divide-y">
              {finance.paid.map((c) => {
                const cl = CONFIRM_LABEL[c.confirm_status];
                return (
                  <ClaimRow key={c.id} c={c}>
                    <span className="text-xs text-gray-400">
                      {c.paid_at && `${dayjs(c.paid_at).format('M/D')} 이체`}
                    </span>
                    <span className={cn('text-xs font-medium', cl.cls)}>{cl.label}</span>
                  </ClaimRow>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 법인카드 ── */}
      {tab === 'corporate' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <CreditCard size={13} /> 법인카드 사용 건은 환급 이체가 없습니다 — 승인된 증빙 확인용 목록입니다.
          </p>
          {finance.corporate.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">승인된 법인카드 경비가 없습니다</p>
          ) : (
            <div className="divide-y">
              {finance.corporate.map((c) => (
                <ClaimRow key={c.id} c={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 경비 항목 ── */}
      {tab === 'categories' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="text-xs text-gray-500">경비 라인 입력 시 선택하는 분류입니다. 사용 중인 항목은 삭제할 수 없습니다.</p>
          <div className="flex gap-2">
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="이름 (예: 교육비)" />
            <Button onClick={addCategory} disabled={isPending}><Plus size={15} /></Button>
          </div>
          <div className="divide-y">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between py-2">
                <p className="text-sm text-gray-900">{cat.name}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400" disabled={isPending}
                  onClick={() => startTransition(async () => {
                    const res = await deleteExpenseCategory(cat.id);
                    if (res?.error) toast.error(res.error);
                    else router.refresh();
                  })}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 담당자 ── */}
      {tab === 'managers' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="text-xs text-gray-500">
            재무 담당자만 이 화면과 팀원 경비 내역(금액·사용처)을 볼 수 있습니다.
            워크스페이스 소유자는 항상 담당자를 지정할 수 있습니다 (잠금 방지).
          </p>
          <div className="flex gap-2">
            <Select value={newManagerId} onValueChange={setNewManagerId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="멤버 선택" /></SelectTrigger>
              <SelectContent>
                {nonManagerMembers.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.name}{m.department && ` · ${m.department}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addManager} disabled={isPending}>
              <ShieldCheck size={15} className="mr-1" /> 권한 부여
            </Button>
          </div>
          {managers.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              아직 지정된 담당자가 없습니다 — 첫 담당자를 지정하세요
            </p>
          ) : (
            <div className="divide-y">
              {managers.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400">
                      {m.granted_by_name && `${m.granted_by_name} 님이 부여 · `}{dayjs(m.created_at).format('YYYY.M.D')}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-gray-400" disabled={isPending} onClick={() => removeManager(m)}>
                    회수
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 정산 배치 다이얼로그 */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>지급 처리</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {selectedClaims.map((c) => (
                <p key={c.id} className="flex justify-between py-0.5">
                  <span className="truncate">{c.user_name ?? '-'} · {c.title}</span>
                  <span className="flex-shrink-0 font-medium">{Number(c.total_amount).toLocaleString()}원</span>
                </p>
              ))}
              <p className="mt-1 flex justify-between border-t pt-1.5 font-semibold text-gray-900">
                <span>합계 {selectedClaims.length}건</span>
                <span>{selectedTotal.toLocaleString()}원</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>배치 이름</Label>
              <Input value={batchTitle} onChange={(e) => setBatchTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>이체일</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>이체증 (선택)</Label>
              <input
                ref={proofRef} type="file" className="hidden"
                accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" size="sm" className="w-full justify-start text-gray-500"
                onClick={() => proofRef.current?.click()}>
                <Paperclip size={14} className="mr-1.5" />
                {proofFile ? proofFile.name : '이체 확인증 첨부 (이미지/PDF)'}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>메모 (선택)</Label>
              <Textarea rows={2} value={batchNote} onChange={(e) => setBatchNote(e.target.value)} placeholder="예: 7월 1차 정산" />
            </div>
            <p className="text-[11px] text-gray-400">
              지급 처리하면 각 직원에게 수령 확인 요청이 전달되고, 14일 무응답 시 미이의 마감으로 기록됩니다.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>닫기</Button>
            <Button onClick={submitBatch} disabled={isPending || !batchTitle.trim() || !transferDate}>
              {isPending ? '처리 중...' : '지급 처리'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
