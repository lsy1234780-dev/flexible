'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useMemo, Fragment } from 'react';
import { TrendingUp, TrendingDown, Minus, Search, ChevronDown, ChevronRight, Calendar, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PlSummary, MonthlyRow, ProductMarginRow, CompanyPlRow, TransactionRow } from '@/actions/profitLoss';

interface Props {
  data: {
    summary: PlSummary;
    monthly: MonthlyRow[];
    products: ProductMarginRow[];
    companies: CompanyPlRow[];
    monthlyProducts: Record<string, ProductMarginRow[]>;
    monthlyTransactions: Record<string, TransactionRow[]>;
  };
  filters: { from?: string; to?: string };
  defaultTab: string;
}

type Tab = 'overview' | 'products' | 'companies';

function fmt(n: number) { return n.toLocaleString('ko-KR'); }
function fmtM(n: number) {
  if (Math.abs(n) >= 100_000_000) return (n / 100_000_000).toFixed(1) + '억';
  if (Math.abs(n) >= 10_000)      return (n / 10_000).toFixed(0) + '만';
  return n.toLocaleString('ko-KR');
}

function MarginBadge({ rate }: { rate: number }) {
  const r = Math.round(rate * 10) / 10;
  const cls = r >= 25 ? 'bg-green-100 text-green-700'
    : r >= 10 ? 'bg-blue-100 text-blue-700'
    : r >= 0  ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-700';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{r.toFixed(1)}%</span>;
}

function ProfitCell({ value }: { value: number }) {
  return (
    <span className={`font-semibold tabular-nums ${value > 0 ? 'text-green-600' : value < 0 ? 'text-red-500' : 'text-gray-400'}`}>
      {value > 0 ? '+' : ''}{fmt(value)}
    </span>
  );
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);
const MONTHS = ['전체', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export default function ProfitLossClient({ data, filters, defaultTab }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { summary, monthly, products, companies, monthlyProducts, monthlyTransactions } = data;

  const [tab, setTab] = useState<Tab>(defaultTab as Tab);
  const [search, setSearch] = useState('');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  // 필터 모드
  const [filterMode, setFilterMode] = useState<'picker' | 'input'>('picker');

  // 연/월 선택
  const [selectedYear, setSelectedYear] = useState(() => {
    if (filters.from) return filters.from.slice(0, 4);
    return CURRENT_YEAR.toString();
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (filters.from && filters.to) {
      const fm = filters.from.slice(5, 7);
      const tm = filters.to.slice(5, 7);
      if (fm === tm) return parseInt(fm).toString();
    }
    return '0'; // 전체
  });

  // 직접 입력
  const [from, setFrom] = useState(filters.from ?? '');
  const [to, setTo]     = useState(filters.to   ?? '');

  function applyPickerFilter() {
    const p = new URLSearchParams();
    const mo = parseInt(selectedMonth);
    if (mo === 0) {
      p.set('from', `${selectedYear}-01-01`);
      p.set('to',   `${selectedYear}-12-31`);
    } else {
      const mm = mo.toString().padStart(2, '0');
      const lastDay = new Date(parseInt(selectedYear), mo, 0).getDate();
      p.set('from', `${selectedYear}-${mm}-01`);
      p.set('to',   `${selectedYear}-${mm}-${lastDay.toString().padStart(2, '0')}`);
    }
    p.set('tab', tab);
    router.push(`${pathname}?${p.toString()}`);
  }

  function applyInputFilter() {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to)   p.set('to', to);
    p.set('tab', tab);
    router.push(`${pathname}?${p.toString()}`);
  }

  function resetFilters() {
    setFrom(''); setTo('');
    setSelectedMonth('0');
    router.push(pathname);
  }

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter((p) =>
      p.product_name.toLowerCase().includes(q) || p.barcode.includes(q),
    );
  }, [products, search]);

  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter((c) => c.company_name.toLowerCase().includes(q));
  }, [companies, search]);

  const maxRevenue = useMemo(() => Math.max(...monthly.map((m) => m.revenue), 1), [monthly]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',   label: '전체 손익' },
    { key: 'products',   label: '제품별 마진' },
    { key: 'companies',  label: '거래처별 손익' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">손익 현황</h1>

      {/* 기간 필터 */}
      <div className="bg-white border rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">조회 기간</span>
          <button
            onClick={() => setFilterMode(filterMode === 'picker' ? 'input' : 'picker')}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Calendar size={12} />
            {filterMode === 'picker' ? '직접 입력' : '연/월 선택'}
          </button>
        </div>

        {filterMode === 'picker' ? (
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {MONTHS.map((label, i) => (
                <option key={i} value={i}>{label}</option>
              ))}
            </select>
            <Button size="sm" onClick={applyPickerFilter}>조회</Button>
            <Button size="sm" variant="outline" onClick={resetFilters}>초기화</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">시작일</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">종료일</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-sm" />
            </div>
            <Button size="sm" onClick={applyInputFilter}>조회</Button>
            <Button size="sm" variant="outline" onClick={resetFilters}>초기화</Button>
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '총 매출',  value: summary.total_revenue, sub: `${summary.order_count}건 · ${summary.qty_sold}개` },
          { label: '총 원가',  value: summary.total_cost,    sub: null },
          { label: '총 이익',  value: summary.total_profit,  sub: null, profit: true },
          { label: '이익률',   value: null,                  rate: summary.margin_rate, sub: '매출 대비' },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-xs font-medium text-gray-500 mb-1">{card.label}</p>
              {card.value !== null && card.value !== undefined ? (
                <p className={`text-xl font-bold tabular-nums ${card.profit ? (card.value > 0 ? 'text-green-600' : card.value < 0 ? 'text-red-500' : 'text-gray-500') : 'text-gray-900'}`}>
                  {card.profit && card.value > 0 ? '+' : ''}{fmtM(card.value)}원
                </p>
              ) : (
                <div className="flex items-center gap-1.5">
                  {card.rate! > 0 ? <TrendingUp size={16} className="text-green-500" />
                    : card.rate! < 0 ? <TrendingDown size={16} className="text-red-500" />
                    : <Minus size={16} className="text-gray-400" />}
                  <p className={`text-xl font-bold ${card.rate! > 0 ? 'text-green-600' : card.rate! < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                    {card.rate!.toFixed(1)}%
                  </p>
                </div>
              )}
              {card.sub && <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 전체 손익 탭 ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {monthly.length === 0 ? (
            <Empty text="해당 기간에 수주 데이터가 없습니다." />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700">월별 손익 추이</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2.5 px-4 font-medium text-gray-600 w-8"></th>
                        <th className="text-left py-2.5 px-3 font-medium text-gray-600">월</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">매출</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">원가</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">이익</th>
                        <th className="text-center py-2.5 px-4 font-medium text-gray-600">이익률</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">수량</th>
                        <th className="py-2.5 px-4 font-medium text-gray-600 w-40">매출 비율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((m) => {
                        const isExpanded = expandedMonth === m.month;
                        return (
                          <Fragment key={m.month}>
                            <tr
                              className="border-b hover:bg-gray-50 transition-colors cursor-pointer"
                              onClick={() => setExpandedMonth(isExpanded ? null : m.month)}
                            >
                              <td className="py-3 px-4 text-gray-400">
                                {isExpanded
                                  ? <ChevronDown size={14} />
                                  : <ChevronRight size={14} />}
                              </td>
                              <td className="py-3 px-3 font-medium">{m.month}</td>
                              <td className="py-3 px-4 text-right tabular-nums">{fmt(m.revenue)}</td>
                              <td className="py-3 px-4 text-right tabular-nums text-gray-500">{fmt(m.cost)}</td>
                              <td className="py-3 px-4 text-right"><ProfitCell value={m.profit} /></td>
                              <td className="py-3 px-4 text-center"><MarginBadge rate={m.margin_rate} /></td>
                              <td className="py-3 px-4 text-right tabular-nums text-gray-500">{m.qty_sold}개</td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                                    <div
                                      className="bg-blue-400 h-2 rounded-full"
                                      style={{ width: `${Math.round(m.revenue / maxRevenue * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-50">
                                <td colSpan={8} className="px-6 pb-3 pt-1">
                                  <p className="text-xs font-semibold text-gray-400 mb-1.5 mt-1">거래 내역</p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-400 border-b border-gray-200">
                                        <th className="text-left py-1.5 pr-3 font-medium">날짜</th>
                                        <th className="text-left py-1.5 pr-3 font-medium">거래처</th>
                                        <th className="text-left py-1.5 pr-3 font-medium">제품명</th>
                                        <th className="text-right py-1.5 px-2 font-medium">수량</th>
                                        <th className="text-right py-1.5 px-2 font-medium">판매단가</th>
                                        <th className="text-right py-1.5 px-2 font-medium">원가</th>
                                        <th className="text-right py-1.5 px-2 font-medium">매출</th>
                                        <th className="text-right py-1.5 px-2 font-medium">이익</th>
                                        <th className="text-center py-1.5 px-2 font-medium">이익률</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(monthlyTransactions[m.month] ?? []).map((tx, idx) => (
                                        <tr
                                          key={idx}
                                          className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors group"
                                          onClick={() => tx.order_id && router.push(`/orders/${tx.order_id}`)}
                                          title="출고현황 보기"
                                        >
                                          <td className="py-1.5 pr-3 tabular-nums text-gray-500">{tx.date}</td>
                                          <td className="py-1.5 pr-3 text-gray-600">{tx.company_name}</td>
                                          <td className="py-1.5 pr-3 font-medium text-gray-700">
                                            <span className="flex items-center gap-1">
                                              {tx.product_name}
                                              <ExternalLink size={10} className="text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" />
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-600">{tx.qty}개</td>
                                          <td className="py-1.5 px-2 text-right tabular-nums text-blue-600 font-medium">{fmt(tx.unit_price)}원</td>
                                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{fmt(tx.cost_price)}원</td>
                                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-700">{fmt(tx.revenue)}</td>
                                          <td className="py-1.5 px-2 text-right"><ProfitCell value={tx.profit} /></td>
                                          <td className="py-1.5 px-2 text-center"><MarginBadge rate={tx.margin_rate} /></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900 text-white">
                        <td className="py-3 px-4" />
                        <td className="py-3 px-3 font-bold">합계</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{fmt(summary.total_revenue)}</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{fmt(summary.total_cost)}</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">
                          {summary.total_profit > 0 ? '+' : ''}{fmt(summary.total_profit)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-bold">{summary.margin_rate.toFixed(1)}%</span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{summary.qty_sold}개</td>
                        <td className="py-3 px-4" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── 제품별 마진 탭 ── */}
      {tab === 'products' && (
        <div className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="제품명, 바코드 검색" />
          {filteredProducts.length === 0 ? (
            <Empty text="해당 기간에 판매된 제품이 없습니다." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2.5 px-4 font-medium text-gray-600">제품명</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">판매수량</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">매출</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">원가</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">이익</th>
                        <th className="text-center py-2.5 px-4 font-medium text-gray-600">이익률</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">단위 마진</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => {
                        const unitMargin = p.qty_sold > 0 ? Math.round(p.profit / p.qty_sold) : 0;
                        return (
                          <tr key={p.product_id} className="border-b hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4">
                              <span className="font-medium">{p.product_name}</span>
                              <span className="block text-xs text-gray-400 font-mono">{p.barcode}</span>
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums text-gray-600">{p.qty_sold}개</td>
                            <td className="py-3 px-4 text-right tabular-nums">{fmt(p.revenue)}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-gray-500">{fmt(p.cost)}</td>
                            <td className="py-3 px-4 text-right"><ProfitCell value={p.profit} /></td>
                            <td className="py-3 px-4 text-center"><MarginBadge rate={p.margin_rate} /></td>
                            <td className="py-3 px-4 text-right">
                              <span className={`text-xs tabular-nums ${unitMargin > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {unitMargin > 0 ? '+' : ''}{fmt(unitMargin)}원/개
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900 text-white">
                        <td className="py-3 px-4 font-bold">합계</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{summary.qty_sold}개</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{fmt(summary.total_revenue)}</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{fmt(summary.total_cost)}</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">
                          {summary.total_profit > 0 ? '+' : ''}{fmt(summary.total_profit)}
                        </td>
                        <td className="py-3 px-4 text-center font-bold">{summary.margin_rate.toFixed(1)}%</td>
                        <td className="py-3 px-4" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── 거래처별 손익 탭 ── */}
      {tab === 'companies' && (
        <div className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="거래처명 검색" />
          {filteredCompanies.length === 0 ? (
            <Empty text="해당 기간에 수주 거래처가 없습니다." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2.5 px-4 font-medium text-gray-600">거래처</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">주문건수</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">수량</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">매출</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">원가</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-600">이익</th>
                        <th className="text-center py-2.5 px-4 font-medium text-gray-600">이익률</th>
                        <th className="py-2.5 px-4 font-medium text-gray-600 w-32">매출 비율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompanies.map((c, i) => {
                        const barPct = summary.total_revenue > 0
                          ? Math.round(c.revenue / summary.total_revenue * 100)
                          : 0;
                        const colors = ['bg-blue-400', 'bg-purple-400', 'bg-orange-400', 'bg-teal-400', 'bg-pink-400'];
                        return (
                          <tr key={c.company_id} className="border-b hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4 font-medium">{c.company_name}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-gray-600">{c.order_count}건</td>
                            <td className="py-3 px-4 text-right tabular-nums text-gray-600">{c.qty_sold}개</td>
                            <td className="py-3 px-4 text-right tabular-nums">{fmt(c.revenue)}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-gray-500">{fmt(c.cost)}</td>
                            <td className="py-3 px-4 text-right"><ProfitCell value={c.profit} /></td>
                            <td className="py-3 px-4 text-center"><MarginBadge rate={c.margin_rate} /></td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 bg-gray-100 rounded-full h-2">
                                  <div
                                    className={`${colors[i % colors.length]} h-2 rounded-full`}
                                    style={{ width: `${barPct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400 w-8 text-right">{barPct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900 text-white">
                        <td className="py-3 px-4 font-bold">합계</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{summary.order_count}건</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{summary.qty_sold}개</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{fmt(summary.total_revenue)}</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">{fmt(summary.total_cost)}</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums">
                          {summary.total_profit > 0 ? '+' : ''}{fmt(summary.total_profit)}
                        </td>
                        <td className="py-3 px-4 text-center font-bold">{summary.margin_rate.toFixed(1)}%</td>
                        <td className="py-3 px-4" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <Input
        className="pl-8 h-8 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-gray-400 border rounded-lg bg-white">
      {text}
    </div>
  );
}
