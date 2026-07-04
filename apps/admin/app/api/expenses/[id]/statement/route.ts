import { createClient } from '@/lib/supabase/server';
import { generateExpenseStatementBuffer } from '@/lib/pdf';
import type { ExpenseStatementData } from '@/lib/pdf';

// 경비 지급 내역서 PDF — expense_claim을 "포맷"만 한다 (계산·세무 없음, HR.md §6).
// RLS가 본인+재무 담당만 조회 허용하므로 접근 제어는 DB가 담당.

const STATUS_LABEL: Record<string, string> = {
  draft: '작성 중', pending: '결재 대기', approved: '승인', rejected: '반려', cancelled: '취소',
};
const SETTLE_LABEL: Record<string, string> = {
  none: '지급 대상 아님 (법인카드)', unpaid: '미지급', paid: '지급 완료',
};
const CONFIRM_LABEL: Record<string, string> = {
  none: '-',
  awaiting: '확인 대기',
  confirmed: '본인 확인',
  disputed: '이의제기',
  auto_closed: '미이의 마감 (자동)', // "확인됨"으로 표기하지 않는다 — 무응답 마감은 별도 기록
};
const METHOD_LABEL: Record<string, string> = { personal: '개인', corporate_card: '법인카드' };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const inline = new URL(req.url).searchParams.has('inline');

  if (process.env.PREVIEW_MODE === 'true') {
    const html = `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#9ca3af;background:#f9fafb">
      <div style="text-align:center"><p style="font-size:14px">미리보기 모드</p><p style="font-size:12px">실제 환경에서 지급 내역서 PDF가 표시됩니다</p></div>
    </body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) return new Response('Unauthorized', { status: 401 });

  const [{ data: claim }, { data: ws }] = await Promise.all([
    supabase
      .from('expense_claims')
      .select('*, expense_claim_items(*, expense_categories(name))')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('workspaces').select('name').limit(1).maybeSingle(),
  ]);

  if (!claim) return new Response('경비 신청을 찾을 수 없습니다', { status: 404 });

  const items = (claim.expense_claim_items as Array<{
    spent_at: string;
    amount: number;
    vat_amount: number | null;
    merchant: string | null;
    payment_method: string;
    memo: string | null;
    expense_categories: { name: string } | null;
  }>).map((it) => ({
    spentAt: it.spent_at,
    category: it.expense_categories?.name ?? '-',
    merchant: it.merchant ?? '-',
    amount: Number(it.amount),
    vatAmount: it.vat_amount == null ? null : Number(it.vat_amount),
    paymentMethod: METHOD_LABEL[it.payment_method] ?? it.payment_method,
    memo: it.memo ?? '',
  }));

  const data: ExpenseStatementData = {
    title: claim.title,
    claimantName: claim.user_name ?? '-',
    claimKind: claim.claim_kind === 'reimbursement' ? '개인 경비 환급' : '법인카드',
    status: STATUS_LABEL[claim.status] ?? claim.status,
    createdAt: claim.created_at,
    totalAmount: Number(claim.total_amount),
    paidAt: claim.paid_at,
    settleLabel: SETTLE_LABEL[claim.settle_status] ?? claim.settle_status,
    confirmLabel: CONFIRM_LABEL[claim.confirm_status] ?? claim.confirm_status,
    workspaceName: ws?.name ?? '워크스페이스',
    items,
  };

  const buffer = await generateExpenseStatementBuffer(data);
  const disposition = inline
    ? 'inline'
    : `attachment; filename*=UTF-8''${encodeURIComponent(`경비지급내역서_${claim.title}`)}.pdf`;

  return new Response(buffer as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition },
  });
}
