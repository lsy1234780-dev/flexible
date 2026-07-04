'use server';

import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { entityHref } from '@/lib/moduleRegistry';

export interface UrgentItem {
  id: string;
  label: string;
  sub: string;
  href: string;
  level: 'high' | 'medium';
  kind: 'order' | 'as' | 'stock' | 'quote' | 'mentions' | 'approval' | 'attendance' | 'expense';
  entityId?: string; // kind별 원본 레코드 id — 인박스에서 인라인 액션(예: 수주 확정) 타겟팅용
}

export async function getUrgentItems(): Promise<UrgentItem[]> {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;

  const now = new Date();
  const day3 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [staleOrders, staleAs, zeroStock, staleQuotes, unreadMentions, myApprovals] = await Promise.all([
    // 7일 이상 대기 중인 수주
    supabase
      .from('orders')
      .select('id, order_number, companies(name), created_at')
      .eq('workspace_id', ws)
      .eq('status', 'pending')
      .lt('created_at', day7),

    // 3일 이상 미처리 A/S — 주의: 실제 컬럼은 number
    supabase
      .from('as_requests')
      .select('id, number, companies(name), created_at, status')
      .eq('workspace_id', ws)
      .in('status', ['received', 'inspecting'])
      .lt('created_at', day3),

    // 재고 0 제품
    supabase
      .from('products')
      .select('id, name, base_stock')
      .eq('workspace_id', ws)
      .eq('base_stock', 0)
      .limit(5),

    // 30일 이상 된 견적서 (확정 전) — 주의: 실제 컬럼은 number/issued_at
    supabase
      .from('quotations')
      .select('id, number, companies(name), issued_at')
      .eq('workspace_id', ws)
      .eq('status', 'draft')
      .lt('issued_at', day30),

    // 안읽은 멘션 (get_my_mentions RPC — 나를 멘션한 메시지 + 읽음 상태)
    user
      ? supabase.rpc('get_my_mentions', { p_limit: 20 })
      : Promise.resolve({ data: [], error: null }),

    // 내가 승인해야 할 대기 건 — chat 모듈과 무관하게 인박스에 노출(멘션 알림에 의존하지 않게)
    user
      ? supabase
          .from('approvals')
          .select('id, entity_type, entity_id, entity_label, requested_by_name, created_at')
          .eq('approver_id', user.id)
          .eq('status', 'pending')
      : Promise.resolve({ data: [], error: null }),
  ]);

  const items: UrgentItem[] = [];

  for (const o of staleOrders.data ?? []) {
    const co = o.companies as unknown as { name: string } | null;
    const days = Math.floor((now.getTime() - new Date(o.created_at).getTime()) / 86400000);
    items.push({
      id: `order-${o.id}`,
      label: `수주 ${o.order_number} 확정 대기`,
      sub: `${co?.name ?? '-'} · ${days}일째 대기 중`,
      href: `/orders/${o.order_number ?? o.id}`,
      level: days >= 14 ? 'high' : 'medium',
      kind: 'order',
      entityId: o.id,
    });
  }

  for (const a of staleAs.data ?? []) {
    const co = a.companies as unknown as { name: string } | null;
    const days = Math.floor((now.getTime() - new Date(a.created_at).getTime()) / 86400000);
    const statusLabel = a.status === 'received' ? '접수' : '점검중';
    items.push({
      id: `as-${a.id}`,
      label: `A/S ${a.number ?? ''} ${statusLabel} ${days}일 경과`,
      sub: `${co?.name ?? '-'} · 처리 필요`,
      href: `/as/${a.id}`,
      level: days >= 7 ? 'high' : 'medium',
      kind: 'as',
      entityId: a.id,
    });
  }

  for (const p of zeroStock.data ?? []) {
    items.push({
      id: `stock-${p.id}`,
      label: `${p.name} 재고 소진`,
      sub: '재고 0개 — 입고 확인 필요',
      href: `/products/${p.id}`,
      level: 'high',
      kind: 'stock',
      entityId: p.id,
    });
  }

  for (const q of staleQuotes.data ?? []) {
    const co = q.companies as unknown as { name: string } | null;
    const days = Math.floor((now.getTime() - new Date(q.issued_at).getTime()) / 86400000);
    items.push({
      id: `quote-${q.id}`,
      label: `견적 ${q.number} 미발송`,
      sub: `${co?.name ?? '-'} · ${days}일째 초안`,
      href: `/quotations/${q.id}`,
      level: 'medium',
      kind: 'quote',
      entityId: q.id,
    });
  }

  type ApprovalRow = { id: string; entity_type: string; entity_id: string; entity_label: string | null; requested_by_name: string | null; created_at: string };
  for (const ap of (myApprovals.data ?? []) as ApprovalRow[]) {
    const href = entityHref(ap.entity_type, ap.entity_id);
    items.push({
      id: `approval-${ap.id}`,
      label: `승인 요청: ${ap.entity_label ?? '레코드'}`,
      sub: `${ap.requested_by_name ?? '요청자'} 님이 승인을 기다립니다`,
      href: href !== '#' ? href : '/inbox',
      level: 'high',
      kind: 'approval',
    });
  }

  // 근태: 관리자에게만 "출근 전 인원" 알림 (attendance 모듈 ON + 근무일 + 기준 출근시간 경과 시)
  // "미출근 판정"이 아니라 현황 알림 — 휴가 승인자는 제외.
  try {
    const { data: modOn } = await supabase
      .from('workspace_modules')
      .select('enabled')
      .eq('module_key', 'attendance')
      .eq('enabled', true)
      .maybeSingle();
    if (modOn) {
      const { data: isMgr } = await supabase.rpc('is_attendance_manager', { p_ws: ws });
      if (isMgr === true) {
        const today = dayjs().format('YYYY-MM-DD');
        const [{ data: policy }, { data: holiday }] = await Promise.all([
          supabase.from('attendance_policy').select('standard_start, work_days').eq('workspace_id', ws).maybeSingle(),
          supabase.from('holidays').select('id').eq('holiday_date', today).maybeSingle(),
        ]);
        const workDays: number[] = policy?.work_days ?? [1, 2, 3, 4, 5];
        const startTime = policy?.standard_start ?? '09:00:00';
        const isWorkDay = workDays.includes(dayjs().day()) && !holiday;
        const pastStart = dayjs().format('HH:mm:ss') > startTime;

        if (isWorkDay && pastStart) {
          const [{ data: memberRows }, { data: todayRecords }, { data: todayLeaves }] = await Promise.all([
            supabase.rpc('get_workspace_members'),
            supabase.from('attendance_records').select('user_id').eq('work_date', today).not('clock_in_at', 'is', null),
            supabase.from('leave_requests').select('user_id').eq('status', 'approved').lte('start_date', today).gte('end_date', today),
          ]);
          const clockedIn = new Set((todayRecords ?? []).map((r) => r.user_id as string));
          const onLeave = new Set((todayLeaves ?? []).map((l) => l.user_id as string));
          const notIn = ((memberRows ?? []) as { user_id: string; name: string }[])
            .filter((m) => !clockedIn.has(m.user_id) && !onLeave.has(m.user_id));
          if (notIn.length > 0) {
            items.push({
              id: 'attendance-not-in',
              label: `출근 전 ${notIn.length}명`,
              sub: `${notIn.slice(0, 3).map((m) => m.name).join(', ')}${notIn.length > 3 ? ' 외' : ''} · 기록 없음 (휴가 제외)`,
              href: '/attendance/team',
              level: 'medium',
              kind: 'attendance',
            });
          }
        }
      }
    }
  } catch {
    // 근태 알림 실패가 인박스 전체를 막지 않게 무시
  }

  // 경비: ① 직원 본인 — 지급 수령확인 대기(D-n), ② 재무 담당 — 이의제기·미지급 aging
  try {
    const { data: expOn } = await supabase
      .from('workspace_modules')
      .select('enabled')
      .eq('module_key', 'expenses')
      .eq('enabled', true)
      .maybeSingle();
    if (expOn && user) {
      // ① 내 수령확인 대기
      const { data: awaiting } = await supabase
        .from('expense_claims')
        .select('id, title, confirm_due_at')
        .eq('user_id', user.id)
        .eq('confirm_status', 'awaiting');
      for (const c of awaiting ?? []) {
        const dleft = c.confirm_due_at
          ? Math.max(0, Math.ceil((new Date(c.confirm_due_at).getTime() - now.getTime()) / 86400000))
          : null;
        items.push({
          id: `expense-confirm-${c.id}`,
          label: `경비 「${c.title}」 지급 확인 필요`,
          sub: dleft != null ? `입금을 확인하고 눌러주세요 · D-${dleft} (무응답 시 미이의 마감)` : '입금을 확인해주세요',
          href: `/expenses/${c.id}`,
          level: dleft != null && dleft <= 3 ? 'high' : 'medium',
          kind: 'expense',
          entityId: c.id,
        });
      }

      // ② 재무 담당: 이의제기(긴급) + 승인 후 7일 미지급 aging
      const { data: isExpMgr } = await supabase.rpc('is_expense_manager', { p_ws: ws });
      if (isExpMgr === true) {
        const [{ data: disputed }, { data: agingUnpaid }] = await Promise.all([
          supabase.from('expense_claims')
            .select('id, title, user_name, dispute_note')
            .eq('confirm_status', 'disputed'),
          supabase.from('expense_claims')
            .select('id, title, user_name, created_at')
            .eq('status', 'approved').eq('claim_kind', 'reimbursement').eq('settle_status', 'unpaid')
            .lt('created_at', day7),
        ]);
        for (const c of disputed ?? []) {
          items.push({
            id: `expense-dispute-${c.id}`,
            label: `경비 이의제기: 「${c.title}」`,
            sub: `${c.user_name ?? '직원'} · ${c.dispute_note ?? '미수령/금액 상이'} — 확인 필요`,
            href: `/expenses/finance`,
            level: 'high',
            kind: 'expense',
            entityId: c.id,
          });
        }
        for (const c of agingUnpaid ?? []) {
          const days = Math.floor((now.getTime() - new Date(c.created_at).getTime()) / 86400000);
          items.push({
            id: `expense-aging-${c.id}`,
            label: `경비 「${c.title}」 미지급 ${days}일 경과`,
            sub: `${c.user_name ?? '직원'} · 승인됨 — 정산 필요`,
            href: `/expenses/finance`,
            level: days >= 14 ? 'high' : 'medium',
            kind: 'expense',
            entityId: c.id,
          });
        }
      }
    }
  } catch {
    // 경비 알림 실패가 인박스 전체를 막지 않게 무시
  }

  const mentionCount = ((unreadMentions.data ?? []) as { is_unread: boolean }[])
    .filter((m) => m.is_unread).length;
  if (mentionCount > 0) {
    items.push({
      id: 'mentions',
      label: `안읽은 멘션 ${mentionCount}건`,
      sub: '채팅에서 나를 언급한 메시지',
      href: `/chat`,
      level: mentionCount >= 3 ? 'high' : 'medium',
      kind: 'mentions',
    });
  }

  // high 먼저, 그 다음 medium
  return items.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
}

// 대시보드는 "사업에 관한 사항과 데이터"만 다룬다 — 개인 할 일/멘션/알림성 정보는 인박스가 전담한다.
export interface DashboardStats {
  orders: { pending: number; confirmed: number; shipped: number };
  quotations: { id: string; quote_number: string; company_name: string; total: number; created_at: string }[];
  as: { received: number; inspecting: number; repairing: number };
  receiving: { pending: number; partial: number };
  crm: { stage: string; color: string; count: number }[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();

  const [orders, quotations, as_reqs, receiving, deals] = await Promise.all([
    // 수주 현황
    supabase
      .from('orders')
      .select('status')
      .eq('workspace_id', ws),

    // 최근 견적 5건 — 실제 컬럼: number/issued_at, 총액은 quotation_items에서 계산
    supabase
      .from('quotations')
      .select('id, number, issued_at, companies(name), quotation_items(quantity, unit_price)')
      .eq('workspace_id', ws)
      .order('issued_at', { ascending: false })
      .limit(5),

    // A/S 현황
    supabase
      .from('as_requests')
      .select('status')
      .eq('workspace_id', ws),

    // 입고 대기
    supabase
      .from('receiving_orders')
      .select('status')
      .eq('workspace_id', ws),

    // CRM 파이프라인 딜
    supabase
      .from('deals')
      .select('deal_stages(name, color)')
      .eq('workspace_id', ws)
      .not('stage_id', 'is', null),
  ]);

  // 수주 집계
  const orderRows = orders.data ?? [];
  const orderStats = {
    pending: orderRows.filter((r) => r.status === 'pending').length,
    confirmed: orderRows.filter((r) => r.status === 'confirmed').length,
    shipped: orderRows.filter((r) => ['shipped', 'completed'].includes(r.status)).length,
  };

  // 최근 견적 (총액은 라인 아이템 합산)
  const quoteList = (quotations.data ?? []).map((q) => ({
    id: q.id,
    quote_number: q.number,
    company_name: (q.companies as unknown as { name: string } | null)?.name ?? '-',
    total: ((q.quotation_items ?? []) as { quantity: number; unit_price: number }[])
      .reduce((s, i) => s + i.quantity * i.unit_price, 0),
    created_at: q.issued_at,
  }));

  // A/S 집계
  const asRows = as_reqs.data ?? [];
  const asStats = {
    received: asRows.filter((r) => r.status === 'received').length,
    inspecting: asRows.filter((r) => r.status === 'inspecting').length,
    repairing: asRows.filter((r) => r.status === 'repairing').length,
  };

  // 입고 집계
  const receivingRows = receiving.data ?? [];
  const receivingStats = {
    pending: receivingRows.filter((r) => r.status === 'pending').length,
    partial: receivingRows.filter((r) => r.status === 'partial').length,
  };

  // CRM 파이프라인 집계
  const stageMap = new Map<string, { color: string; count: number }>();
  for (const d of deals.data ?? []) {
    const stage = d.deal_stages as unknown as { name: string; color: string } | null;
    if (!stage) continue;
    const cur = stageMap.get(stage.name) ?? { color: stage.color, count: 0 };
    cur.count += 1;
    stageMap.set(stage.name, cur);
  }
  const crmList = [...stageMap.entries()].map(([stage, v]) => ({ stage, ...v }));

  return {
    orders: orderStats,
    quotations: quoteList,
    as: asStats,
    receiving: receivingStats,
    crm: crmList,
  };
}

// ── 대시보드 차트 (사업 데이터 추이) ──
export interface TrendPoint { date: string; value: number; }
export interface NamedValue { name: string; value: number; }

export interface DashboardCharts {
  // 추이(일별/월별 토글용) — 최근 30일 / 최근 12개월, 값 없는 구간도 0으로 채움
  revenueTrendDaily: TrendPoint[];
  revenueTrendMonthly: TrendPoint[];
  orderCountTrendDaily: TrendPoint[];
  orderCountTrendMonthly: TrendPoint[];
  // 순위/비중 — 최근 12개월 확정 매출 기준
  topCompanies: NamedValue[];
  topProducts: NamedValue[];
  categoryBreakdown: NamedValue[];
}

export async function getDashboardCharts(): Promise<DashboardCharts> {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const month12 = dayjs().subtract(12, 'month').toISOString();

  // 확정된 수주만 "매출"로 집계 — order_items 합산. 12개월치를 한 번에 가져와 일별/월별 뷰를 함께 만든다.
  // 취소 제외: cancel RPC는 status='cancelled'로 바꾸되 confirmed_at은 남겨두고 재고를 복원하므로,
  // confirmed_at만 필터하면 '취소돼서 되돌린 매출'이 그대로 집계된다 → status로 명시적으로 배제.
  const { data, error } = await supabase
    .from('orders')
    .select('confirmed_at, companies(name), order_items(quantity, unit_price, products(name, categories(name)))')
    .eq('workspace_id', ws)
    .not('confirmed_at', 'is', null)
    .neq('status', 'cancelled')
    .gte('confirmed_at', month12);
  if (error) throw new Error(error.message);

  type Row = {
    confirmed_at: string;
    companies: { name: string } | null;
    order_items: { quantity: number; unit_price: number; products: { name: string; categories: { name: string } | null } | null }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const byDayRevenue = new Map<string, number>();
  const byDayCount = new Map<string, number>();
  const byMonthRevenue = new Map<string, number>();
  const byMonthCount = new Map<string, number>();
  const byCompany = new Map<string, number>();
  const byProduct = new Map<string, number>();
  const byCategory = new Map<string, number>();

  for (const o of rows) {
    const items = o.order_items ?? [];
    const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

    // 일별 키는 연도 포함(YYYY-MM-DD) — 12개월치를 집계하므로 MM.DD로 키잉하면 정확히 1년 전 같은
    // 월일이 오늘 버킷에 합산돼 이중집계된다. 표시 라벨(MM.DD)은 채우는 단계에서 별도로 만든다.
    const dayKey = dayjs(o.confirmed_at).format('YYYY-MM-DD');
    const monthKey = dayjs(o.confirmed_at).format('YYYY.MM');
    byDayRevenue.set(dayKey, (byDayRevenue.get(dayKey) ?? 0) + total);
    byDayCount.set(dayKey, (byDayCount.get(dayKey) ?? 0) + 1);
    byMonthRevenue.set(monthKey, (byMonthRevenue.get(monthKey) ?? 0) + total);
    byMonthCount.set(monthKey, (byMonthCount.get(monthKey) ?? 0) + 1);

    const companyName = o.companies?.name ?? '기타';
    byCompany.set(companyName, (byCompany.get(companyName) ?? 0) + total);

    for (const item of items) {
      const itemTotal = item.quantity * item.unit_price;
      const productName = item.products?.name ?? '기타';
      byProduct.set(productName, (byProduct.get(productName) ?? 0) + itemTotal);
      const categoryName = item.products?.categories?.name ?? '미분류';
      byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + itemTotal);
    }
  }

  // 최근 30일 — 매일 채움 (데이터 없는 날도 0). 조회 키는 전체 날짜, 축 라벨은 MM.DD.
  const revenueTrendDaily: TrendPoint[] = [];
  const orderCountTrendDaily: TrendPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day');
    const key = d.format('YYYY-MM-DD');
    const label = d.format('MM.DD');
    revenueTrendDaily.push({ date: label, value: byDayRevenue.get(key) ?? 0 });
    orderCountTrendDaily.push({ date: label, value: byDayCount.get(key) ?? 0 });
  }

  // 최근 12개월 — 매월 채움
  const revenueTrendMonthly: TrendPoint[] = [];
  const orderCountTrendMonthly: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const key = dayjs().subtract(i, 'month').format('YYYY.MM');
    revenueTrendMonthly.push({ date: key, value: byMonthRevenue.get(key) ?? 0 });
    orderCountTrendMonthly.push({ date: key, value: byMonthCount.get(key) ?? 0 });
  }

  const toRanked = (m: Map<string, number>, limit: number) =>
    [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, limit);

  return {
    revenueTrendDaily,
    revenueTrendMonthly,
    orderCountTrendDaily,
    orderCountTrendMonthly,
    topCompanies: toRanked(byCompany, 5),
    topProducts: toRanked(byProduct, 5),
    categoryBreakdown: toRanked(byCategory, 8),
  };
}
