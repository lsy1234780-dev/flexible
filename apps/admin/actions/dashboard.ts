'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';

export interface UrgentItem {
  id: string;
  label: string;
  sub: string;
  href: string;
  level: 'high' | 'medium';
}

export async function getUrgentItems(): Promise<UrgentItem[]> {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const { data: { user } } = await supabase.auth.getUser();

  const now = new Date();
  const day3 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [staleOrders, staleAs, zeroStock, staleQuotes, unreadMentions] = await Promise.all([
    // 7일 이상 대기 중인 수주
    supabase
      .from('orders')
      .select('id, order_number, companies(name), created_at')
      .eq('workspace_id', ws)
      .eq('status', 'pending')
      .lt('created_at', day7),

    // 3일 이상 미처리 A/S
    supabase
      .from('as_requests')
      .select('id, request_number, companies(name), created_at, status')
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

    // 30일 이상 된 견적서 (확정 전)
    supabase
      .from('quotations')
      .select('id, quote_number, companies(name), created_at')
      .eq('workspace_id', ws)
      .eq('status', 'draft')
      .lt('created_at', day30),

    // 안읽은 멘션
    user
      ? supabase
          .from('message_mentions')
          .select('id, messages(body, channels(name))')
          .eq('mentioned_user_id', user.id)
          .eq('is_read', false)
          .limit(3)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const items: UrgentItem[] = [];

  for (const o of staleOrders.data ?? []) {
    const co = o.companies as { name: string } | null;
    const days = Math.floor((now.getTime() - new Date(o.created_at).getTime()) / 86400000);
    items.push({
      id: `order-${o.id}`,
      label: `수주 ${o.order_number} 확정 대기`,
      sub: `${co?.name ?? '-'} · ${days}일째 대기 중`,
      href: `/orders`,
      level: days >= 14 ? 'high' : 'medium',
    });
  }

  for (const a of staleAs.data ?? []) {
    const co = a.companies as { name: string } | null;
    const days = Math.floor((now.getTime() - new Date(a.created_at).getTime()) / 86400000);
    const statusLabel = a.status === 'received' ? '접수' : '점검중';
    items.push({
      id: `as-${a.id}`,
      label: `A/S ${a.request_number ?? ''} ${statusLabel} ${days}일 경과`,
      sub: `${co?.name ?? '-'} · 처리 필요`,
      href: `/as`,
      level: days >= 7 ? 'high' : 'medium',
    });
  }

  for (const p of zeroStock.data ?? []) {
    items.push({
      id: `stock-${p.id}`,
      label: `${p.name} 재고 소진`,
      sub: '재고 0개 — 입고 확인 필요',
      href: `/products/${p.id}`,
      level: 'high',
    });
  }

  for (const q of staleQuotes.data ?? []) {
    const co = q.companies as { name: string } | null;
    const days = Math.floor((now.getTime() - new Date(q.created_at).getTime()) / 86400000);
    items.push({
      id: `quote-${q.id}`,
      label: `견적 ${q.quote_number} 미발송`,
      sub: `${co?.name ?? '-'} · ${days}일째 초안`,
      href: `/quotations`,
      level: 'medium',
    });
  }

  const mentionCount = (unreadMentions.data ?? []).length;
  if (mentionCount > 0) {
    items.push({
      id: 'mentions',
      label: `안읽은 멘션 ${mentionCount}건`,
      sub: '채팅에서 나를 언급한 메시지',
      href: `/chat`,
      level: mentionCount >= 3 ? 'high' : 'medium',
    });
  }

  // high 먼저, 그 다음 medium
  return items.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
}

export interface DashboardStats {
  orders: { pending: number; confirmed: number; shipped: number };
  quotations: { id: string; quote_number: string; company_name: string; total: number; created_at: string }[];
  as: { received: number; inspecting: number; repairing: number };
  inventory: { id: string; name: string; stock: number }[];
  receiving: { pending: number; partial: number };
  crm: { stage: string; color: string; count: number }[];
  mentions: { unread: number };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();

  const { data: { user } } = await supabase.auth.getUser();

  const [orders, quotations, as_reqs, products, receiving, deals, mentions] = await Promise.all([
    // 수주 현황
    supabase
      .from('orders')
      .select('status')
      .eq('workspace_id', ws),

    // 최근 견적 5건
    supabase
      .from('quotations')
      .select('id, quote_number, total_amount, created_at, companies(name)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(5),

    // A/S 현황
    supabase
      .from('as_requests')
      .select('status')
      .eq('workspace_id', ws),

    // 재고 부족 (stock 10 이하)
    supabase
      .from('products')
      .select('id, name, base_stock')
      .eq('workspace_id', ws)
      .lte('base_stock', 10)
      .order('base_stock', { ascending: true })
      .limit(5),

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

    // 내 미읽음 멘션
    user
      ? supabase
          .from('message_mentions')
          .select('id')
          .eq('mentioned_user_id', user.id)
          .eq('is_read', false)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // 수주 집계
  const orderRows = orders.data ?? [];
  const orderStats = {
    pending: orderRows.filter((r) => r.status === 'pending').length,
    confirmed: orderRows.filter((r) => r.status === 'confirmed').length,
    shipped: orderRows.filter((r) => ['shipped', 'completed'].includes(r.status)).length,
  };

  // 최근 견적
  const quoteList = (quotations.data ?? []).map((q) => ({
    id: q.id,
    quote_number: q.quote_number,
    company_name: (q.companies as { name: string } | null)?.name ?? '-',
    total: q.total_amount ?? 0,
    created_at: q.created_at,
  }));

  // A/S 집계
  const asRows = as_reqs.data ?? [];
  const asStats = {
    received: asRows.filter((r) => r.status === 'received').length,
    inspecting: asRows.filter((r) => r.status === 'inspecting').length,
    repairing: asRows.filter((r) => r.status === 'repairing').length,
  };

  // 재고 부족 제품
  const inventoryList = (products.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stock: p.base_stock ?? 0,
  }));

  // 입고 집계
  const receivingRows = receiving.data ?? [];
  const receivingStats = {
    pending: receivingRows.filter((r) => r.status === 'pending').length,
    partial: receivingRows.filter((r) => r.status === 'partial').length,
  };

  // CRM 파이프라인 집계
  const stageMap = new Map<string, { color: string; count: number }>();
  for (const d of deals.data ?? []) {
    const stage = d.deal_stages as { name: string; color: string } | null;
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
    inventory: inventoryList,
    receiving: receivingStats,
    crm: crmList,
    mentions: { unread: (mentions.data ?? []).length },
  };
}
