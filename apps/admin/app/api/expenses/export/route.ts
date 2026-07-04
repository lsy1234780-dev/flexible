import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { toCsv, csvResponse } from '@/lib/csv';

// 월 경비 CSV export (재무 담당 전용) — 회계 분개·증빙 대조용.
// 지출일(spent_at) 기준 월, 라인 단위. 결재·지급 상태 컬럼을 포함해 엑셀에서 자유롭게 거르게 한다.

const METHOD_LABEL: Record<string, string> = { personal: '개인', corporate_card: '법인카드' };
const STATUS_LABEL: Record<string, string> = {
  draft: '작성중', pending: '결재대기', approved: '승인', rejected: '반려', cancelled: '취소',
};
const SETTLE_LABEL: Record<string, string> = { none: '-', unpaid: '미지급', paid: '지급완료' };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get('year') ?? '', 10);
  const month = parseInt(url.searchParams.get('month') ?? '', 10);
  if (!year || !month) return new Response('year/month가 필요합니다', { status: 400 });

  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const { data: isMgr } = await supabase.rpc('is_expense_manager', { p_ws: ws });
  if (isMgr !== true) return new Response('재무 담당만 내보낼 수 있습니다', { status: 403 });

  const start = dayjs(new Date(year, month - 1, 1));
  const from = start.format('YYYY-MM-DD');
  const to = start.endOf('month').format('YYYY-MM-DD');

  const { data } = await supabase
    .from('expense_claim_items')
    .select(`
      spent_at, amount, vat_amount, merchant, payment_method, memo,
      expense_categories(name),
      expense_claims(title, user_name, claim_kind, status, settle_status, paid_at,
        expense_settlement_batches(title))
    `)
    .gte('spent_at', from).lte('spent_at', to)
    .order('spent_at');

  const rows = (data ?? []).map((it) => {
    const cat = it.expense_categories as unknown as { name: string } | null;
    const claim = it.expense_claims as unknown as {
      title: string; user_name: string | null; claim_kind: string;
      status: string; settle_status: string; paid_at: string | null;
      expense_settlement_batches: { title: string } | null;
    } | null;
    return [
      it.spent_at,
      claim?.user_name ?? '',
      cat?.name ?? '',
      it.merchant ?? '',
      Number(it.amount),
      it.vat_amount == null ? '' : Number(it.vat_amount),
      METHOD_LABEL[it.payment_method] ?? it.payment_method,
      claim?.title ?? '',
      claim ? (STATUS_LABEL[claim.status] ?? claim.status) : '',
      claim ? (SETTLE_LABEL[claim.settle_status] ?? claim.settle_status) : '',
      claim?.paid_at ? dayjs(claim.paid_at).format('YYYY-MM-DD') : '',
      claim?.expense_settlement_batches?.title ?? '',
      it.memo ?? '',
    ];
  });

  const csv = toCsv(
    ['지출일', '신청자', '분류', '사용처', '금액', '부가세', '결제수단', '청구 제목', '결재상태', '지급상태', '지급일', '정산배치', '메모'],
    rows,
  );
  return csvResponse(csv, `경비_내역_${start.format('YYYY-MM')}.csv`);
}
