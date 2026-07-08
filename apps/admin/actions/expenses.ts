'use server';

// 경비 모듈 — 청구·결재·정산 (docs/architecture/HR.md §5)
//
// 결재: approvals 재사용(entity_type='expense'). 승인/반려 → DB 트리거가 status 동기화.
// 정산: B안 — 회계 트랙(settle_status: 재무 이체 즉시 완료)과 수령확인 트랙(confirm_status:
//       직원 확인/이의제기, 14일 무응답 auto_closed="미이의 마감") 분리.
// 권한: 재무 담당 = expense_managers 명시 부여(+ owner fallback). anon+RLS — service role 안 씀.
// 상태 전이의 하드 가드는 전부 DB 트리거(expense_claims_guard) — 여기서는 정상 경로만 흘린다.

import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { getCurrentUser } from '@/actions/auth';
import { getWorkspaceMembers } from '@/actions/chat';
import { requestApproval } from '@/actions/approvals';
import { postRecordEvent } from '@/actions/chat';
import { getEnabledModules } from '@/actions/modules';
import { revalidatePath } from 'next/cache';

const CONFIRM_DUE_DAYS = 14; // 무응답 자동마감 기한

// ─── 타입 ───

export interface ExpenseCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface ExpenseClaimItem {
  id: string;
  claim_id: string;
  category_id: string | null;
  amount: number;
  vat_amount: number | null;
  spent_at: string;
  merchant: string | null;
  payment_method: 'personal' | 'corporate_card';
  receipt_path: string | null;
  receipt_name: string | null;
  memo: string | null;
  expense_categories?: { name: string } | null;
}

export interface ExpenseClaim {
  id: string;
  user_id: string;
  user_name: string | null;
  title: string;
  claim_kind: 'reimbursement' | 'corporate_card';
  total_amount: number;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';
  settle_status: 'none' | 'unpaid' | 'paid';
  settlement_batch_id: string | null;
  paid_at: string | null;
  confirm_status: 'none' | 'awaiting' | 'confirmed' | 'disputed' | 'auto_closed';
  confirm_due_at: string | null;
  confirmed_at: string | null;
  closed_by: 'employee' | 'auto' | null;
  dispute_note: string | null;
  created_at: string;
}

export interface ExpenseManagerRow {
  user_id: string;
  name: string;
  granted_by_name: string | null;
  created_at: string;
}

// ─── 재무 담당 (명시적 권한 부여) ───

export async function isExpenseManagerAction(): Promise<boolean> {
  if (process.env.PREVIEW_MODE === 'true') return true;
  try {
    const supabase = await createClient();
    const ws = await getCurrentWorkspaceId();
    const { data } = await supabase.rpc('is_expense_manager', { p_ws: ws });
    return data === true;
  } catch {
    return false;
  }
}

export async function getExpenseManagers(): Promise<ExpenseManagerRow[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expense_managers')
    .select('user_id, granted_by_name, created_at')
    .order('created_at');
  if (error) throw new Error(error.message);

  const members = await getWorkspaceMembers();
  const me = await getCurrentUser();
  const nameOf = (id: string) =>
    members.find((m) => m.user_id === id)?.name ?? (me?.id === id ? me.name : '알 수 없음');

  return (data ?? []).map((r) => ({
    user_id: r.user_id,
    name: nameOf(r.user_id),
    granted_by_name: r.granted_by_name,
    created_at: r.created_at,
  }));
}

export async function grantExpenseManager(userId: string) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };
  const { error } = await supabase.from('expense_managers').insert({
    workspace_id: ws,
    user_id: userId,
    granted_by: me.id,
    granted_by_name: me.name,
  });
  if (error) {
    if (error.code === '23505') return { error: '이미 담당자입니다' };
    return { error: error.message };
  }
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function revokeExpenseManager(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('expense_managers').delete().eq('user_id', userId);
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { success: true };
}

// ─── 경비 항목 ───

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  let { data, error } = await supabase.from('expense_categories').select('*').order('sort_order');
  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    const ws = await getCurrentWorkspaceId();
    await supabase.rpc('seed_default_expense_categories', { p_ws: ws });
    ({ data, error } = await supabase.from('expense_categories').select('*').order('sort_order'));
    if (error) throw new Error(error.message);
  }
  return (data ?? []) as ExpenseCategory[];
}

export async function createExpenseCategory(name: string) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const { count } = await supabase
    .from('expense_categories')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ws);
  const { error } = await supabase.from('expense_categories').insert({
    workspace_id: ws,
    name: name.trim(),
    sort_order: count ?? 0,
  });
  if (error) return { error: error.message };
  revalidatePath('/expenses/finance');
  return { success: true };
}

export async function deleteExpenseCategory(id: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from('expense_claim_items')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);
  if (count && count > 0) {
    return { error: `이 항목으로 등록된 경비가 ${count}건 있습니다. 삭제할 수 없습니다.` };
  }
  const { error } = await supabase.from('expense_categories').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/expenses/finance');
  return { success: true };
}

// ─── 14일 무응답 자동마감 (lazy — 목록 로드 시점에 기한 지난 건을 마감) ───
// cron 없이도 "미이의 마감"이 관측 시점에 정직하게 기록된다. closed_by='auto'.

async function autoCloseOverdue() {
  try {
    const supabase = await createClient();
    await supabase
      .from('expense_claims')
      .update({ confirm_status: 'auto_closed', closed_by: 'auto' })
      .eq('confirm_status', 'awaiting')
      .lt('confirm_due_at', new Date().toISOString());
  } catch {
    // 자동마감 실패가 목록 조회를 막지 않게 무시 (다음 로드에서 재시도)
  }
}

// ─── 내 경비 ───

export async function getMyClaims(): Promise<ExpenseClaim[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  await autoCloseOverdue();
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return [];
  const { data } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('user_id', me.id)
    .order('created_at', { ascending: false });
  return (data ?? []) as ExpenseClaim[];
}

export async function getClaim(id: string): Promise<{ claim: ExpenseClaim; items: ExpenseClaimItem[] } | null> {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();
  const [{ data: claim }, { data: items }] = await Promise.all([
    supabase.from('expense_claims').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('expense_claim_items')
      .select('*, expense_categories(name)')
      .eq('claim_id', id)
      .order('spent_at'),
  ]);
  if (!claim) return null;
  return { claim: claim as ExpenseClaim, items: (items ?? []) as ExpenseClaimItem[] };
}

export async function createClaim(title: string, kind: 'reimbursement' | 'corporate_card') {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };
  if (!title.trim()) return { error: '제목을 입력하세요' };

  const { data, error } = await supabase
    .from('expense_claims')
    .insert({
      workspace_id: ws,
      user_id: me.id,
      user_name: me.name,
      title: title.trim(),
      claim_kind: kind,
      settle_status: kind === 'corporate_card' ? 'none' : 'unpaid',
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  revalidatePath('/expenses');
  return { id: data.id };
}

export async function updateClaimTitle(id: string, title: string) {
  const supabase = await createClient();
  if (!title.trim()) return { error: '제목을 입력하세요' };
  const { error } = await supabase.from('expense_claims').update({ title: title.trim() }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(`/expenses/${id}`);
  return { success: true };
}

export async function deleteDraftClaim(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('expense_claims').delete().eq('id', id).eq('status', 'draft');
  if (error) return { error: error.message };
  revalidatePath('/expenses');
  return { success: true };
}

// ─── 라인 (draft에서만 — 트리거가 강제) ───

async function recomputeTotal(claimId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('expense_claim_items').select('amount').eq('claim_id', claimId);
  const total = (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  await supabase.from('expense_claims').update({ total_amount: total }).eq('id', claimId);
}

export async function addClaimItem(claimId: string, input: {
  categoryId: string | null;
  amount: number;
  vatAmount: number | null;
  spentAt: string;
  merchant: string;
  paymentMethod: 'personal' | 'corporate_card';
  memo: string;
}) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  if (!input.amount || input.amount <= 0) return { error: '금액을 입력하세요' };

  const { error } = await supabase.from('expense_claim_items').insert({
    workspace_id: ws,
    claim_id: claimId,
    category_id: input.categoryId,
    amount: input.amount,
    vat_amount: input.vatAmount,
    spent_at: input.spentAt,
    merchant: input.merchant || null,
    payment_method: input.paymentMethod,
    memo: input.memo || null,
  });
  if (error) return { error: error.message };
  await recomputeTotal(claimId);
  revalidatePath(`/expenses/${claimId}`);
  return { success: true };
}

export async function removeClaimItem(itemId: string, claimId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('expense_claim_items').delete().eq('id', itemId);
  if (error) return { error: error.message };
  await recomputeTotal(claimId);
  revalidatePath(`/expenses/${claimId}`);
  return { success: true };
}

// ─── 영수증 업로드 (uploadChatFile 패턴) ───

const RECEIPT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'pdf']);

export async function uploadReceipt(formData: FormData) {
  const file = formData.get('file') as File | null;
  const claimId = formData.get('claimId') as string | null;
  const itemId = formData.get('itemId') as string | null;
  if (!file || !claimId || !itemId) return { error: '파일이 없습니다' };
  if (file.size > 10 * 1024 * 1024) return { error: '영수증은 10MB 이하만 가능합니다' };
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!RECEIPT_EXTENSIONS.has(ext)) return { error: `이미지 또는 PDF만 가능합니다 (.${ext})` };

  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${ws}/${claimId}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from('expense-receipts')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) return { error: error.message };

  const { error: updError } = await supabase
    .from('expense_claim_items')
    .update({ receipt_path: path, receipt_name: file.name })
    .eq('id', itemId);
  if (updError) return { error: updError.message };

  revalidatePath(`/expenses/${claimId}`);
  return { success: true };
}

// 이체증 업로드 (재무 — 정산 배치용, {ws}/batch/ 경로)
export async function uploadBatchProof(formData: FormData) {
  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일이 없습니다' };
  if (file.size > 10 * 1024 * 1024) return { error: '이체증은 10MB 이하만 가능합니다' };
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!RECEIPT_EXTENSIONS.has(ext)) return { error: `이미지 또는 PDF만 가능합니다 (.${ext})` };

  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${ws}/batch/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from('expense-receipts')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) return { error: error.message };
  return { success: true, path, name: file.name };
}

// 서명 URL (영수증·이체증 열람 — storage RLS가 접근 판정)
export async function getReceiptUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from('expense-receipts').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

// ─── 결재 요청 / 취소 ───

export async function requestClaimApproval(claimId: string, approverId: string, approverName: string, note: string) {
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };

  const detail = await getClaim(claimId);
  if (!detail) return { error: '경비 신청을 찾을 수 없습니다' };
  if (detail.claim.status !== 'draft') return { error: '작성 중 상태에서만 결재를 요청할 수 있습니다' };
  if (detail.items.length === 0) return { error: '경비 라인을 1건 이상 추가하세요' };

  // draft → pending (가드 트리거: 요청자 본인만 허용)
  const { error } = await supabase.from('expense_claims').update({ status: 'pending' }).eq('id', claimId);
  if (error) return { error: error.message };

  const label = `${me.name} 경비 「${detail.claim.title}」 ${Number(detail.claim.total_amount).toLocaleString()}원`;
  const res = await requestApproval('expense', claimId, label, approverId, approverName, note);
  if (res?.error) {
    // 결재 요청 실패 → draft로 되돌릴 수 없으므로(가드) 취소 처리 후 에러 반환
    await supabase.from('expense_claims').update({ status: 'cancelled' }).eq('id', claimId);
    return { error: res.error };
  }

  revalidatePath(`/expenses/${claimId}`);
  return { success: true };
}

export async function cancelClaim(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('expense_claims').update({ status: 'cancelled' }).eq('id', id);
  if (error) return { error: '작성 중 또는 결재 대기 상태에서만 취소할 수 있습니다' };
  revalidatePath('/expenses');
  revalidatePath(`/expenses/${id}`);
  return { success: true };
}

// ─── 수령확인 트랙 (직원) ───

export async function confirmReceiptMoney(claimId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('expense_claims')
    .update({ confirm_status: 'confirmed', closed_by: 'employee', confirmed_at: new Date().toISOString() })
    .eq('id', claimId);
  if (error) return { error: error.message };
  revalidatePath('/expenses');
  revalidatePath(`/expenses/${claimId}`);
  return { success: true };
}

export async function disputeReceipt(claimId: string, note: string) {
  if (!note.trim()) return { error: '이의제기 사유를 입력하세요' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('expense_claims')
    .update({ confirm_status: 'disputed', dispute_note: note.trim() })
    .eq('id', claimId);
  if (error) return { error: error.message };

  // 재무에게 스레드 알림 (chat 켜져 있을 때 — 인박스 긴급 항목은 chat 무관하게 뜸)
  const detail = await getClaim(claimId);
  if (detail && (await getEnabledModules()).includes('chat')) {
    await postRecordEvent('expense', claimId, detail.claim.title, `이의제기 접수 — ${note.trim()}`);
  }
  revalidatePath('/expenses');
  revalidatePath(`/expenses/${claimId}`);
  return { success: true };
}

// ─── 재무: 정산 ───

export interface FinanceData {
  toPay: ExpenseClaim[];       // 승인 & 미지급 (환급 대상)
  disputed: ExpenseClaim[];    // 이의제기
  paid: ExpenseClaim[];        // 지급 완료 (최근)
  corporate: ExpenseClaim[];   // 법인카드 승인 건 (증빙 확인용)
}

export async function getFinanceClaims(): Promise<FinanceData> {
  if (process.env.PREVIEW_MODE === 'true') return { toPay: [], disputed: [], paid: [], corporate: [] };
  await autoCloseOverdue();
  const supabase = await createClient();

  const [toPay, disputed, paid, corporate] = await Promise.all([
    supabase.from('expense_claims').select('*')
      .eq('status', 'approved').eq('claim_kind', 'reimbursement').eq('settle_status', 'unpaid')
      .order('created_at'),
    supabase.from('expense_claims').select('*')
      .eq('confirm_status', 'disputed')
      .order('created_at'),
    supabase.from('expense_claims').select('*')
      .eq('settle_status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(50),
    supabase.from('expense_claims').select('*')
      .eq('status', 'approved').eq('claim_kind', 'corporate_card')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return {
    toPay: (toPay.data ?? []) as ExpenseClaim[],
    disputed: (disputed.data ?? []) as ExpenseClaim[],
    paid: (paid.data ?? []) as ExpenseClaim[],
    corporate: (corporate.data ?? []) as ExpenseClaim[],
  };
}

// 정산 배치: 승인된 미지급 N건 → 이체일+이체증과 함께 일괄 지급완료 + 직원 수령확인 통지
export async function createSettlementBatch(input: {
  title: string;
  transferDate: string;   // YYYY-MM-DD
  note: string;
  claimIds: string[];
  proofPath: string | null;
  proofName: string | null;
}) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };
  if (!input.title.trim()) return { error: '배치 이름을 입력하세요' };
  if (input.claimIds.length === 0) return { error: '지급할 경비를 선택하세요' };

  const { data: batch, error } = await supabase
    .from('expense_settlement_batches')
    .insert({
      workspace_id: ws,
      title: input.title.trim(),
      transfer_date: input.transferDate,
      note: input.note || null,
      proof_path: input.proofPath,
      proof_name: input.proofName,
      created_by: me.id,
      created_by_name: me.name,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  const dueAt = dayjs().add(CONFIRM_DUE_DAYS, 'day').toISOString();
  const paidAt = dayjs(input.transferDate).toISOString();
  const chatEnabled = (await getEnabledModules()).includes('chat');

  for (const claimId of input.claimIds) {
    const { data: updated, error: updError } = await supabase
      .from('expense_claims')
      .update({
        settle_status: 'paid',
        settlement_batch_id: batch.id,
        paid_at: paidAt,
        confirm_status: 'awaiting',
        confirm_due_at: dueAt,
      })
      .eq('id', claimId)
      .eq('status', 'approved')
      .eq('settle_status', 'unpaid')
      .select('title')
      .maybeSingle();
    if (updError) return { error: `${updError.message} (배치 ${input.title} 처리 중)` };
    if (updated && chatEnabled) {
      await postRecordEvent('expense', claimId, updated.title,
        `${input.transferDate} 이체 처리되었습니다 — ${CONFIRM_DUE_DAYS}일 내 수령 확인해주세요`);
    }
  }

  revalidatePath('/expenses/finance');
  revalidatePath('/expenses');
  return { success: true };
}

// 이의제기 처리 후 재통지 (재이체/정정 완료 → 다시 awaiting, 기한 리셋)
export async function renotifyAfterDispute(claimId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('expense_claims')
    .update({
      confirm_status: 'awaiting',
      confirm_due_at: dayjs().add(CONFIRM_DUE_DAYS, 'day').toISOString(),
      dispute_note: null,
    })
    .eq('id', claimId);
  if (error) return { error: error.message };
  revalidatePath('/expenses/finance');
  return { success: true };
}

// 이체 취소 롤백 (paid → unpaid, 통지 회수)
export async function rollbackPayment(claimId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('expense_claims')
    .update({
      settle_status: 'unpaid',
      settlement_batch_id: null,
      paid_at: null,
      confirm_status: 'none',
      confirm_due_at: null,
    })
    .eq('id', claimId);
  if (error) return { error: error.message };
  revalidatePath('/expenses/finance');
  return { success: true };
}

// ─── 내 경비 진행 상황 (인박스 카드 — 승인 상태에 따라 유기적으로 뜨고 사라짐) ───
// 진행 중인 것만: 결재 대기(pending) / 승인됐지만 아직 미지급(approved+unpaid).
// 지급되면 '수령 확인'(getMyAwaitingConfirm)이 인박스 긴급으로 넘겨받고, 확인·마감되면 전부 사라짐.
// draft(작성 중)·반려·취소·완료는 여기 안 뜬다.

export interface MyExpenseFlowItem {
  id: string;
  title: string;
  total_amount: number;
  stage: 'pending' | 'approved_unpaid';
  label: string;
}

export async function getMyExpenseFlow(): Promise<MyExpenseFlowItem[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  try {
    const supabase = await createClient();
    const me = await getCurrentUser();
    if (!me) return [];

    const { data } = await supabase
      .from('expense_claims')
      .select('id, title, total_amount, status, settle_status, claim_kind')
      .eq('user_id', me.id)
      .or('status.eq.pending,and(status.eq.approved,settle_status.eq.unpaid)')
      .order('created_at', { ascending: false });

    const items: MyExpenseFlowItem[] = [];
    for (const c of data ?? []) {
      if (c.status === 'pending') {
        items.push({ id: c.id, title: c.title, total_amount: Number(c.total_amount), stage: 'pending', label: '결재 대기' });
      } else if (c.status === 'approved' && c.settle_status === 'unpaid' && c.claim_kind === 'reimbursement') {
        items.push({ id: c.id, title: c.title, total_amount: Number(c.total_amount), stage: 'approved_unpaid', label: '승인 · 지급 대기' });
      }
    }
    return items;
  } catch {
    return [];
  }
}

// ─── 내 확인 대기 (인박스·내 경비 배너용) ───

export async function getMyAwaitingConfirm(): Promise<ExpenseClaim[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return [];
  const { data } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('user_id', me.id)
    .eq('confirm_status', 'awaiting')
    .order('confirm_due_at');
  return (data ?? []) as ExpenseClaim[];
}
