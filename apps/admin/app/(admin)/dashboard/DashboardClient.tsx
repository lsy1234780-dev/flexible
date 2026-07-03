'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import numeral from 'numeral';
import {
  Settings2, X, Plus, ShoppingCart, FileText,
  Wrench, Truck, TrendingUp, LineChart as LineChartIcon, BarChart3, PieChart as PieChartIcon, Package,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { DashboardStats, DashboardCharts } from '@/actions/dashboard';

// ── 위젯 정의 ──
// 대시보드는 "사업에 관한 사항과 데이터"만 다룬다 — 개인 할 일/멘션/알림성 위젯(긴급 처리·재고
// 알림·내 멘션)은 인박스가 전담하므로 여기 두지 않는다(중복 방지).
// 클라우드플레어처럼 지표를 직접 조합하는 건 아니고, 미리 만든 차트 중 골라서 추가/제거하는 방식.
type WidgetId =
  | 'orders' | 'quotations' | 'as' | 'receiving' | 'crm'
  | 'revenueTrend' | 'orderCountTrend' | 'topCompanies' | 'topProducts' | 'categoryBreakdown';

interface WidgetDef {
  id: WidgetId;
  label: string;
  icon: React.ReactNode;
  description: string;
  wide?: boolean; // 차트류는 좁은 칸에서 찌그러지므로 그리드에서 더 넓게 차지
}

const WIDGET_DEFS: WidgetDef[] = [
  { id: 'orders',            label: '수주 현황',          icon: <ShoppingCart size={15} />,  description: '대기·확정·출고 건수' },
  { id: 'quotations',        label: '최근 견적',           icon: <FileText size={15} />,      description: '최근 견적서 5건' },
  { id: 'as',                label: 'A/S 현황',            icon: <Wrench size={15} />,        description: '접수·점검·수리 건수' },
  { id: 'receiving',         label: '입고 대기',            icon: <Truck size={15} />,         description: '미처리 입고지시서' },
  { id: 'crm',               label: '영업 파이프라인',     icon: <TrendingUp size={15} />,    description: '단계별 딜 현황' },
  { id: 'revenueTrend',      label: '매출 추이',           icon: <LineChartIcon size={15} />, description: '확정 매출 — 일별/월별', wide: true },
  { id: 'orderCountTrend',   label: '수주 건수 추이',       icon: <LineChartIcon size={15} />, description: '확정 수주 건수 — 일별/월별', wide: true },
  { id: 'topCompanies',      label: '거래처별 매출 TOP5',   icon: <BarChart3 size={15} />,     description: '최근 12개월 확정 매출 기준', wide: true },
  { id: 'topProducts',       label: '제품별 판매 TOP5',     icon: <Package size={15} />,       description: '최근 12개월 확정 매출 기준', wide: true },
  { id: 'categoryBreakdown', label: '카테고리별 매출 비중', icon: <PieChartIcon size={15} />,  description: '최근 12개월 확정 매출 기준', wide: true },
];

// 부서별 기본 위젯 세트
const DEFAULT_WIDGETS: Record<string, WidgetId[]> = {
  sales:      ['crm', 'orders', 'quotations', 'revenueTrend'],
  logistics:  ['receiving', 'orders'],
  warehouse:  ['receiving', 'orders'],
  service:    ['as', 'orders'],
  management: ['orders', 'crm', 'as', 'revenueTrend', 'topCompanies'],
};
const FALLBACK_WIDGETS: WidgetId[] = ['orders', 'crm', 'as'];

function getDefaultWidgets(department: string): WidgetId[] {
  return DEFAULT_WIDGETS[department] ?? FALLBACK_WIDGETS;
}

const STORAGE_KEY = 'dashboard_widgets_v1';

function loadWidgets(department: string): WidgetId[] {
  const validIds = WIDGET_DEFS.map((w) => w.id);
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${department}`);
    // 이전 버전에 있다가 제거된 위젯 id(mentions/inventory)가 저장돼 있을 수 있어 걸러낸다
    if (raw) return (JSON.parse(raw) as WidgetId[]).filter((id) => validIds.includes(id));
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
  charts: DashboardCharts;
  department: string;
  departmentLabel: string;
}

export default function DashboardClient({ stats, charts, department, departmentLabel }: Props) {
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
            charts={charts}
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

// ── 위젯 카드 래퍼 ──
function WidgetCard({ id, stats, charts, editing, onRemove }: {
  id: WidgetId; stats: DashboardStats; charts: DashboardCharts; editing: boolean; onRemove: () => void;
}) {
  const def = WIDGET_DEFS.find((w) => w.id === id)!;
  return (
    <div className={cn('relative rounded-xl border bg-white shadow-sm', def.wide && 'sm:col-span-2')}>
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
        {id === 'orders'            && <OrdersWidget stats={stats.orders} />}
        {id === 'quotations'        && <QuotationsWidget stats={stats.quotations} />}
        {id === 'as'                && <AsWidget stats={stats.as} />}
        {id === 'receiving'         && <ReceivingWidget stats={stats.receiving} />}
        {id === 'crm'               && <CrmWidget stats={stats.crm} />}
        {id === 'revenueTrend'      && (
          <TrendChartWidget
            daily={charts.revenueTrendDaily}
            monthly={charts.revenueTrendMonthly}
            formatValue={(v) => `₩${numeral(v).format('0,0')}`}
            formatAxis={(v) => numeral(v).format('0a')}
          />
        )}
        {id === 'orderCountTrend'   && (
          <TrendChartWidget
            daily={charts.orderCountTrendDaily}
            monthly={charts.orderCountTrendMonthly}
            formatValue={(v) => `${numeral(v).format('0,0')}건`}
            formatAxis={(v) => numeral(v).format('0a')}
          />
        )}
        {id === 'topCompanies'      && <RankedBarWidget data={charts.topCompanies} formatValue={(v) => `₩${numeral(v).format('0,0')}`} />}
        {id === 'topProducts'       && <RankedBarWidget data={charts.topProducts} formatValue={(v) => `₩${numeral(v).format('0,0')}`} />}
        {id === 'categoryBreakdown' && <CategoryPieWidget data={charts.categoryBreakdown} />}
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
      <Link href="/deals" className="mt-1 block text-xs text-blue-600 hover:underline">
        파이프라인 보기 →
      </Link>
    </div>
  );
}

// 추이 차트 — 일별/월별 토글 가능한 라인 차트 (매출 추이, 수주 건수 추이가 공유)
function TrendChartWidget({ daily, monthly, formatValue, formatAxis }: {
  daily: DashboardCharts['revenueTrendDaily'];
  monthly: DashboardCharts['revenueTrendMonthly'];
  formatValue: (v: number) => string;
  formatAxis: (v: number) => string;
}) {
  const [granularity, setGranularity] = useState<'day' | 'month'>('day');
  const data = granularity === 'day' ? daily : monthly;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-lg font-bold text-gray-900 tabular-nums">{formatValue(total)}</p>
        <div className="flex rounded-md bg-gray-100 p-0.5 text-xs">
          {(['day', 'month'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={cn(
                'rounded px-2 py-0.5 font-medium transition-colors',
                granularity === g ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600',
              )}
            >
              {g === 'day' ? '일별' : '월별'}
            </button>
          ))}
        </div>
      </div>
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">해당 기간 데이터가 없습니다.</p>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }}
                interval={granularity === 'day' ? 6 : 1} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={40}
                tickFormatter={(v: number) => formatAxis(v)} />
              <Tooltip
                formatter={(v) => [formatValue(Number(v)), '']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// 순위 바 차트 — 거래처 TOP5, 제품 TOP5가 공유
function RankedBarWidget({ data, formatValue }: { data: DashboardCharts['topCompanies']; formatValue: (v: number) => string }) {
  if (data.length === 0) return <p className="text-sm text-gray-400">최근 12개월 확정된 매출이 없습니다.</p>;
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false}
            tickFormatter={(v: number) => numeral(v).format('0a')} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} tickLine={false} axisLine={false} width={80} />
          <Tooltip
            formatter={(v) => [formatValue(Number(v)), '']}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#14b8a6', '#f97316'];

function CategoryPieWidget({ data }: { data: DashboardCharts['categoryBreakdown'] }) {
  if (data.length === 0) return <p className="text-sm text-gray-400">최근 12개월 확정된 매출이 없습니다.</p>;
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Pie data={data} dataKey="value" nameKey="name" cx="35%" cy="50%" outerRadius={55} paddingAngle={1}>
            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => [`₩${numeral(Number(v)).format('0,0')}`, '']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          <Legend layout="vertical" verticalAlign="middle" align="right" iconSize={8}
            wrapperStyle={{ fontSize: 11, color: '#374151' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
