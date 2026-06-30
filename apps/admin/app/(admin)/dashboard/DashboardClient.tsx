'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import numeral from 'numeral';
import {
  Settings2, X, Plus, ShoppingCart, FileText,
  Wrench, Package, Truck, TrendingUp, Bell,
  AlertCircle, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardStats, UrgentItem } from '@/actions/dashboard';

// ── 위젯 정의 ──
type WidgetId = 'orders' | 'quotations' | 'as' | 'inventory' | 'receiving' | 'crm' | 'mentions';

interface WidgetDef {
  id: WidgetId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const WIDGET_DEFS: WidgetDef[] = [
  { id: 'orders',     label: '수주 현황',      icon: <ShoppingCart size={15} />, description: '대기·확정·출고 건수' },
  { id: 'quotations', label: '최근 견적',       icon: <FileText size={15} />,     description: '최근 견적서 5건' },
  { id: 'as',         label: 'A/S 현황',        icon: <Wrench size={15} />,       description: '접수·점검·수리 건수' },
  { id: 'inventory',  label: '재고 부족 알림',  icon: <Package size={15} />,      description: '재고 10개 이하 제품' },
  { id: 'receiving',  label: '입고 대기',        icon: <Truck size={15} />,        description: '미처리 입고지시서' },
  { id: 'crm',        label: '영업 파이프라인', icon: <TrendingUp size={15} />,   description: '단계별 딜 현황' },
  { id: 'mentions',   label: '내 멘션',          icon: <Bell size={15} />,         description: '안읽은 멘션 수' },
];

// 부서별 기본 위젯 세트
const DEFAULT_WIDGETS: Record<string, WidgetId[]> = {
  sales:      ['crm', 'orders', 'quotations', 'mentions'],
  logistics:  ['receiving', 'inventory', 'orders'],
  warehouse:  ['inventory', 'receiving', 'orders'],
  service:    ['as', 'orders', 'mentions'],
  management: ['orders', 'crm', 'as', 'inventory'],
};
const FALLBACK_WIDGETS: WidgetId[] = ['orders', 'crm', 'as', 'inventory'];

function getDefaultWidgets(department: string): WidgetId[] {
  return DEFAULT_WIDGETS[department] ?? FALLBACK_WIDGETS;
}

const STORAGE_KEY = 'dashboard_widgets_v1';

function loadWidgets(department: string): WidgetId[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${department}`);
    if (raw) return JSON.parse(raw) as WidgetId[];
  } catch { /* noop */ }
  return getDefaultWidgets(department);
}

function saveWidgets(department: string, widgets: WidgetId[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${department}`, JSON.stringify(widgets));
  } catch { /* noop */ }
}

// ── Props ──
interface Props {
  stats: DashboardStats;
  urgentItems: UrgentItem[];
  department: string;
  departmentLabel: string;
}

export default function DashboardClient({ stats, urgentItems, department, departmentLabel }: Props) {
  const [widgets, setWidgets] = useState<WidgetId[]>([]);
  const [editing, setEditing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setWidgets(loadWidgets(department));
    setMounted(true);
  }, [department]);

  function removeWidget(id: WidgetId) {
    const next = widgets.filter((w) => w !== id);
    setWidgets(next);
    saveWidgets(department, next);
  }

  function addWidget(id: WidgetId) {
    if (widgets.includes(id)) return;
    const next = [...widgets, id];
    setWidgets(next);
    saveWidgets(department, next);
  }

  const available = WIDGET_DEFS.filter((w) => !widgets.includes(w.id));

  if (!mounted) return null;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
          <p className="text-sm text-gray-400 mt-0.5">{departmentLabel} 기본 뷰</p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
            editing
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 text-gray-600 hover:bg-gray-100',
          )}
        >
          <Settings2 size={14} />
          {editing ? '편집 완료' : '편집'}
        </button>
      </div>

      {/* 지금 처리할 것 */}
      {urgentItems.length > 0 && (
        <UrgentSection items={urgentItems} />
      )}

      {/* 위젯 추가 영역 (편집 모드) */}
      {editing && available.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">추가할 위젯 선택</p>
          <div className="flex flex-wrap gap-2">
            {available.map((w) => (
              <button
                key={w.id}
                onClick={() => addWidget(w.id)}
                className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                <Plus size={13} className="text-gray-400" />
                {w.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 위젯 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map((id) => (
          <WidgetCard
            key={id}
            id={id}
            stats={stats}
            editing={editing}
            onRemove={() => removeWidget(id)}
          />
        ))}
        {widgets.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-sm text-gray-400">위젯이 없습니다.</p>
            <button
              onClick={() => setEditing(true)}
              className="mt-2 text-sm font-medium text-blue-600 hover:underline"
            >
              편집 모드에서 추가하세요
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 지금 처리할 것 ──
function UrgentSection({ items }: { items: UrgentItem[] }) {
  const high = items.filter((i) => i.level === 'high');
  const medium = items.filter((i) => i.level === 'medium');

  return (
    <div className="rounded-xl border border-red-100 bg-red-50/40">
      <div className="flex items-center gap-2 border-b border-red-100 px-4 py-3">
        <AlertCircle size={15} className="text-red-500" />
        <span className="text-sm font-semibold text-red-700">지금 처리할 것</span>
        <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-red-100/60">
        {high.map((item) => (
          <UrgentRow key={item.id} item={item} />
        ))}
        {medium.map((item) => (
          <UrgentRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function UrgentRow({ item }: { item: UrgentItem }) {
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors"
    >
      {item.level === 'high'
        ? <AlertCircle size={14} className="flex-shrink-0 text-red-500" />
        : <AlertTriangle size={14} className="flex-shrink-0 text-orange-400" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{item.label}</p>
        <p className="text-xs text-gray-500">{item.sub}</p>
      </div>
      <ChevronRight size={14} className="flex-shrink-0 text-gray-300" />
    </Link>
  );
}

// ── 위젯 카드 래퍼 ──
function WidgetCard({ id, stats, editing, onRemove }: { id: WidgetId; stats: DashboardStats; editing: boolean; onRemove: () => void }) {
  const def = WIDGET_DEFS.find((w) => w.id === id)!;
  return (
    <div className="relative rounded-xl border bg-white shadow-sm">
      {editing && (
        <button
          onClick={onRemove}
          className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-red-600 transition-colors"
        >
          <X size={11} />
        </button>
      )}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="text-gray-400">{def.icon}</span>
        <span className="text-sm font-semibold text-gray-800">{def.label}</span>
      </div>
      <div className="p-4">
        {id === 'orders'     && <OrdersWidget stats={stats.orders} />}
        {id === 'quotations' && <QuotationsWidget stats={stats.quotations} />}
        {id === 'as'         && <AsWidget stats={stats.as} />}
        {id === 'inventory'  && <InventoryWidget stats={stats.inventory} />}
        {id === 'receiving'  && <ReceivingWidget stats={stats.receiving} />}
        {id === 'crm'        && <CrmWidget stats={stats.crm} />}
        {id === 'mentions'   && <MentionsWidget stats={stats.mentions} />}
      </div>
    </div>
  );
}

// ── 개별 위젯 콘텐츠 ──

function StatRow({ label, value, href, color }: { label: string; value: number; href: string; color: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={cn('text-lg font-bold tabular-nums', color)}>{value}</span>
    </Link>
  );
}

function OrdersWidget({ stats }: { stats: DashboardStats['orders'] }) {
  return (
    <div className="space-y-0.5">
      <StatRow label="대기" value={stats.pending} href="/orders?status=pending" color="text-yellow-600" />
      <StatRow label="확정" value={stats.confirmed} href="/orders?status=confirmed" color="text-blue-600" />
      <StatRow label="출고·완료" value={stats.shipped} href="/orders?status=shipped" color="text-green-600" />
    </div>
  );
}

function QuotationsWidget({ stats }: { stats: DashboardStats['quotations'] }) {
  if (stats.length === 0) return <p className="text-sm text-gray-400">견적서가 없습니다.</p>;
  return (
    <div className="space-y-2">
      {stats.map((q) => (
        <Link key={q.id} href={`/quotations`} className="flex items-center justify-between rounded-lg px-1 py-1 hover:bg-gray-50">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{q.company_name}</p>
            <p className="text-[11px] text-gray-400">{q.quote_number} · {dayjs(q.created_at).format('MM.DD')}</p>
          </div>
          <span className="ml-2 flex-shrink-0 text-sm font-semibold text-gray-700">
            {numeral(q.total).format('0,0')}
          </span>
        </Link>
      ))}
    </div>
  );
}

function AsWidget({ stats }: { stats: DashboardStats['as'] }) {
  return (
    <div className="space-y-0.5">
      <StatRow label="접수" value={stats.received} href="/as?status=received" color="text-orange-600" />
      <StatRow label="점검 중" value={stats.inspecting} href="/as?status=inspecting" color="text-yellow-600" />
      <StatRow label="수리 중" value={stats.repairing} href="/as?status=repairing" color="text-blue-600" />
    </div>
  );
}

function InventoryWidget({ stats }: { stats: DashboardStats['inventory'] }) {
  if (stats.length === 0) {
    return <p className="text-sm text-gray-400">재고 부족 제품이 없습니다.</p>;
  }
  return (
    <div className="space-y-1.5">
      {stats.map((p) => (
        <Link key={p.id} href={`/products/${p.id}`} className="flex items-center justify-between rounded-lg px-1 py-1 hover:bg-gray-50">
          <span className="text-sm text-gray-700 truncate">{p.name}</span>
          <span className={cn('ml-2 flex-shrink-0 text-sm font-bold tabular-nums', p.stock === 0 ? 'text-red-600' : 'text-orange-500')}>
            {p.stock}개
          </span>
        </Link>
      ))}
    </div>
  );
}

function ReceivingWidget({ stats }: { stats: DashboardStats['receiving'] }) {
  return (
    <div className="space-y-0.5">
      <StatRow label="대기" value={stats.pending} href="/receiving?status=pending" color="text-yellow-600" />
      <StatRow label="부분 입고" value={stats.partial} href="/receiving?status=partial" color="text-blue-600" />
    </div>
  );
}

function CrmWidget({ stats }: { stats: DashboardStats['crm'] }) {
  if (stats.length === 0) return <p className="text-sm text-gray-400">진행 중인 딜이 없습니다.</p>;
  const total = stats.reduce((s, c) => s + c.count, 0);
  return (
    <div className="space-y-2">
      {stats.map((s) => (
        <div key={s.stage} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">{s.stage}</span>
            <span className="font-semibold text-gray-900 tabular-nums">{s.count}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${Math.round((s.count / total) * 100)}%`, backgroundColor: s.color || '#6366f1' }}
            />
          </div>
        </div>
      ))}
      <Link href="/crm" className="mt-1 block text-xs text-blue-600 hover:underline">
        파이프라인 보기 →
      </Link>
    </div>
  );
}

function MentionsWidget({ stats }: { stats: DashboardStats['mentions'] }) {
  return (
    <div className="flex flex-col items-center justify-center py-4 gap-1">
      <span className={cn('text-4xl font-bold tabular-nums', stats.unread > 0 ? 'text-red-500' : 'text-gray-300')}>
        {stats.unread}
      </span>
      <p className="text-sm text-gray-400">안읽은 멘션</p>
      <Link href="/chat" className="mt-1 text-xs text-blue-600 hover:underline">
        채팅 열기 →
      </Link>
    </div>
  );
}
