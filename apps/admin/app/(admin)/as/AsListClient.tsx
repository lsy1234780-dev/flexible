'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Plus, X, Loader2, Wrench, CheckCircle2, Truck,
  Search, ChevronRight, AlertCircle, ClipboardList, User,
  ChevronDown, ShieldCheck, ShieldOff,
} from 'lucide-react';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createAsRequest } from '@/actions/asRequests';
import { DEFECTIVE_PART_OPTIONS } from '@/lib/asConstants';
import type { AsStatus } from '@/lib/asConstants';

interface Company { id: string; name: string; }
interface Product { id: string; name: string; barcode: string; }

interface AsRequest {
  id: string;
  number: string;
  status: AsStatus;
  customer_name: string | null;
  customer_phone: string | null;
  product_name: string;
  serial_number: string | null;
  symptom: string;
  defective_parts: string[];
  assigned_to: string | null;
  estimated_completion_at: string | null;
  completed_at: string | null;
  repair_cost: number | null;
  created_at: string;
  updated_at: string;
  companies: { id: string; name: string } | null;
  products: { id: string; name: string; barcode: string } | null;
}

interface Props {
  requests: AsRequest[];
  companies: Company[];
  products: Product[];
  currentUserName: string;
  warrantyMap?: Record<string, string | null>;
}

function WarrantyInline({ serial, warrantyMap }: { serial: string | null; warrantyMap?: Record<string, string | null> }) {
  if (!serial || !warrantyMap) return null;
  if (!(serial in warrantyMap)) return null;
  const shippedAt = warrantyMap[serial];
  if (!shippedAt) return <span className="inline-flex items-center gap-1 text-[10px] text-gray-400"><ShieldOff size={10} />보증 대상 아님</span>;
  const daysLeft = dayjs(shippedAt).add(12, 'month').diff(dayjs(), 'day');
  if (daysLeft < 0) return <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-medium"><ShieldOff size={10} />보증 만료</span>;
  if (daysLeft <= 30) return <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-medium"><ShieldCheck size={10} />보증 {daysLeft}일 남음</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium"><ShieldCheck size={10} />보증 {daysLeft}일 남음</span>;
}

// ── 상태별 섹션 설정 ──

const SECTIONS: {
  status: AsStatus;
  label: string;
  actionLabel: string;
  color: string;       // 섹션 헤더 색
  dot: string;         // 상태 점 색
  cardBorder: string;  // 카드 강조 border
  icon: React.ComponentType<{ size?: number; className?: string }>;
  collapsible: boolean;
}[] = [
  {
    status: 'received',
    label: '검수 대기',
    actionLabel: '검수 시작 →',
    color: 'text-orange-600',
    dot: 'bg-orange-400',
    cardBorder: 'border-l-orange-400',
    icon: ClipboardList,
    collapsible: false,
  },
  {
    status: 'inspecting',
    label: '검수 진행 중',
    actionLabel: '검수 계속하기 →',
    color: 'text-blue-600',
    dot: 'bg-blue-400',
    cardBorder: 'border-l-blue-400',
    icon: Search,
    collapsible: false,
  },
  {
    status: 'repairing',
    label: '수리 진행 중',
    actionLabel: '수리 완료 처리 →',
    color: 'text-amber-600',
    dot: 'bg-amber-400',
    cardBorder: 'border-l-amber-400',
    icon: Wrench,
    collapsible: false,
  },
  {
    status: 'completed',
    label: '수리 완료 — 반납 대기',
    actionLabel: '반납 처리 →',
    color: 'text-green-600',
    dot: 'bg-green-400',
    cardBorder: 'border-l-green-400',
    icon: CheckCircle2,
    collapsible: false,
  },
  {
    status: 'returned',
    label: '반납 완료',
    actionLabel: '내역 보기 →',
    color: 'text-gray-400',
    dot: 'bg-gray-300',
    cardBorder: 'border-l-gray-200',
    icon: Truck,
    collapsible: true,
  },
];

export default function AsListClient({ requests, companies, products, currentUserName, warrantyMap }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState('');
  const [myOnly, setMyOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AsStatus | 'all'>('all');
  const [companyFilter, setCompanyFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<AsStatus>>(new Set(['returned']));

  // 접수 폼
  const [showCreate, setShowCreate] = useState(false);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  // 필터 드롭다운용 - 실제 요청에 등장한 거래처/제품만
  const filterCompanies = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requests) {
      if (r.companies) map.set(r.companies.id, r.companies.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ id, name }));
  }, [requests]);

  const filterProducts = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requests) {
      if (r.products) map.set(r.products.id, r.products.name);
      else if (r.product_name) map.set(r.product_name, r.product_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ id, name }));
  }, [requests]);

  // 검색 + 필터 적용
  const visibleRequests = useMemo(() => requests.filter((r) => {
    if (myOnly && r.assigned_to !== currentUserName) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (companyFilter && r.companies?.id !== companyFilter) return false;
    if (productFilter) {
      const matchById = r.products?.id === productFilter;
      const matchByName = r.product_name === productFilter;
      if (!matchById && !matchByName) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !r.number.toLowerCase().includes(q) &&
        !r.product_name.toLowerCase().includes(q) &&
        !(r.customer_name?.toLowerCase().includes(q) ?? false) &&
        !(r.serial_number?.toLowerCase().includes(q) ?? false) &&
        !(r.companies?.name.toLowerCase().includes(q) ?? false)
      ) return false;
    }
    return true;
  }), [requests, myOnly, statusFilter, companyFilter, productFilter, searchQuery, currentUserName]);

  const myCount = requests.filter((r) => r.assigned_to === currentUserName).length;
  const hasActiveFilter = !!(statusFilter !== 'all' || companyFilter || productFilter || searchQuery);

  function toggleSection(status: AsStatus) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function togglePart(part: string) {
    setSelectedParts((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part],
    );
  }

  function resetForm() {
    setShowCreate(false);
    setSelectedParts([]);
    setSelectedCompanyId('');
    setSelectedProductId('');
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    selectedParts.forEach((p) => fd.append('defective_parts', p));
    if (selectedCompanyId) fd.set('company_id', selectedCompanyId);
    if (selectedProductId) fd.set('product_id', selectedProductId);

    startTransition(async () => {
      const result = await createAsRequest(fd);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('AS 접수 완료');
        resetForm();
        router.refresh();
        if (result.id) router.push(`/as/${result.id}`);
      }
    });
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">A/S 관리</h1>
        <div className="flex gap-2">
          {hasActiveFilter && (
            <Button variant="ghost" size="sm" className="text-gray-500 gap-1" onClick={() => {
              setStatusFilter('all');
              setCompanyFilter('');
              setProductFilter('');
              setSearchQuery('');
            }}>
              <X size={14} /> 필터 초기화
            </Button>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-1" />
            A/S 접수
          </Button>
        </div>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-1 flex-wrap">
        {([
          ['all', '전체', requests.length],
          ...SECTIONS.map((s) => [s.status, s.label, requests.filter((r) => r.status === s.status).length] as const),
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key as AsStatus | 'all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === key
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              statusFilter === key ? 'bg-white/20' : 'bg-gray-100'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* 거래처 + 제품 필터 + 검색 + 내담당 */}
      <div className="flex gap-2 flex-wrap">
        {filterCompanies.length > 0 && (
          <Select value={companyFilter || '_all'} onValueChange={(v) => setCompanyFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="거래처 전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">거래처 전체</SelectItem>
              {filterCompanies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {filterProducts.length > 0 && (
          <Select value={productFilter || '_all'} onValueChange={(v) => setProductFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue placeholder="제품 전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">제품 전체</SelectItem>
              {filterProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="제품명, 고객명, 시리얼, 접수번호 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 h-9"
          />
        </div>

        {currentUserName && (
          <button
            type="button"
            onClick={() => setMyOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap h-9 ${
              myOnly
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            <User size={14} />
            내 담당
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              myOnly ? 'bg-white/20' : 'bg-gray-100'
            }`}>
              {myCount}
            </span>
          </button>
        )}
      </div>

      {/* 요약 */}
      {visibleRequests.length > 0 && (
        <div className="flex gap-2 text-xs flex-wrap">
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {hasActiveFilter ? `필터 결과 ${visibleRequests.length}건` : `전체 ${requests.length}건`}
          </span>
          {(() => {
            const active = visibleRequests.filter((r) => r.status === 'received' || r.status === 'inspecting' || r.status === 'repairing').length;
            const done = visibleRequests.filter((r) => r.status === 'completed').length;
            return (
              <>
                {active > 0 && <span className="px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 font-medium">진행 중 {active}건</span>}
                {done > 0 && <span className="px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">반납 대기 {done}건</span>}
              </>
            );
          })()}
        </div>
      )}

      {/* 접수 모달 */}
      <Dialog open={showCreate} onOpenChange={(v) => { if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AS 접수</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">고객 정보</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">거래처</label>
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">선택 (선택사항)</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">고객/담당자명</label>
                  <input name="customer_name" type="text" placeholder="홍길동"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                  <input name="customer_phone" type="text" placeholder="010-0000-0000"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">제품 정보</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">등록 제품 연결</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">선택 (선택사항)</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    제품명 <span className="text-red-500">*</span>
                  </label>
                  <input name="product_name" type="text" required
                    defaultValue={selectedProduct?.name ?? ''} key={selectedProduct?.id}
                    placeholder="예: 스캐너 HS-200"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">시리얼 번호</label>
                  <input name="serial_number" type="text" placeholder="SN-XXXXXXXX"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">증상</p>
              <div className="space-y-3">
                <textarea name="symptom" required rows={3}
                  placeholder="증상을 구체적으로 입력하세요"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
                <div className="flex flex-wrap gap-2">
                  {DEFECTIVE_PART_OPTIONS.map((part) => (
                    <button key={part} type="button" onClick={() => togglePart(part)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selectedParts.includes(part)
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}>
                      {part}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">처리 정보</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
                  <input name="assigned_to" type="text" defaultValue={currentUserName}
                    placeholder="담당자명"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">완료 예정일</label>
                  <input name="estimated_completion_at" type="date"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">수리 비용 (원)</label>
                  <input name="repair_cost" type="number" min={0} placeholder="0"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={resetForm}>취소</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 size={14} className="animate-spin mr-1" />}
                접수
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 상태별 그룹 */}
      {visibleRequests.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Search size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{hasActiveFilter ? '조건에 맞는 AS 건이 없습니다' : '검색 결과가 없습니다'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map((section) => {
            const items = visibleRequests.filter((r) => r.status === section.status);
            if (items.length === 0) return null;

            const SIcon = section.icon;
            const isCollapsed = collapsedSections.has(section.status);

            return (
              <div key={section.status}>
                {/* 섹션 헤더 */}
                <button
                  type="button"
                  onClick={() => section.collapsible && toggleSection(section.status)}
                  className={`w-full flex items-center gap-2 mb-3 group ${section.collapsible ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${section.dot}`} />
                  <SIcon size={14} className={section.color} />
                  <span className={`text-sm font-bold ${section.color}`}>{section.label}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    section.status === 'returned'
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-gray-900 text-white'
                  }`}>
                    {items.length}
                  </span>
                  <span className="flex-1 h-px bg-gray-100 ml-1" />
                  {section.collapsible && (
                    <ChevronDown
                      size={14}
                      className={`text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                    />
                  )}
                </button>

                {/* 카드 목록 */}
                {!isCollapsed && (
                  <div className="space-y-2">
                    {items.map((req) => {
                      const isOverdue = req.estimated_completion_at &&
                        !req.completed_at &&
                        dayjs(req.estimated_completion_at).isBefore(dayjs(), 'day');
                      const isMyTask = req.assigned_to === currentUserName;

                      return (
                        <Link
                          key={req.id}
                          href={req.status === 'received' || req.status === 'inspecting'
                            ? `/as/${req.id}/inspect`
                            : `/as/${req.id}`}
                          className={`flex items-stretch bg-white border border-l-4 ${section.cardBorder} rounded-xl hover:shadow-md transition-all overflow-hidden group`}
                        >
                          {/* 본문 */}
                          <div className="flex-1 px-4 py-3 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-gray-300">{req.number}</span>
                              {isMyTask && (
                                <span className="text-[10px] font-semibold bg-gray-900 text-white px-1.5 py-0.5 rounded-full">
                                  내 담당
                                </span>
                              )}
                              {isOverdue && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">
                                  <AlertCircle size={10} />
                                  기한 초과
                                </span>
                              )}
                            </div>

                            <p className="font-semibold text-gray-900 truncate">{req.product_name}</p>

                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {req.companies && (
                                <span className="text-xs text-gray-500">{req.companies.name}</span>
                              )}
                              {req.customer_name && (
                                <span className="text-xs text-gray-500">{req.customer_name}</span>
                              )}
                              {req.serial_number && (
                                <span className="text-xs text-gray-400 font-mono">{req.serial_number}</span>
                              )}
                              <WarrantyInline serial={req.serial_number} warrantyMap={warrantyMap} />
                            </div>

                            <p className="text-xs text-gray-500 mt-1.5 line-clamp-1">{req.symptom}</p>
                          </div>

                          {/* 우측 메타 */}
                          <div className="flex flex-col items-end justify-between px-4 py-3 shrink-0 border-l border-gray-50">
                            <div className="flex items-center gap-1 text-xs text-gray-300 group-hover:text-gray-500 transition-colors">
                              <span className={`text-xs font-medium ${section.color}`}>{section.actionLabel}</span>
                              <ChevronRight size={14} />
                            </div>
                            <div className="space-y-0.5 text-right">
                              {req.assigned_to && (
                                <p className="text-xs text-gray-400">{req.assigned_to}</p>
                              )}
                              {req.estimated_completion_at && !req.completed_at && (
                                <p className={`text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                                  ~{dayjs(req.estimated_completion_at).format('MM.DD')}
                                </p>
                              )}
                              <p className="text-xs text-gray-300">
                                {dayjs(req.created_at).format('MM.DD')} 접수
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* 진행 중인 건이 없을 때 */}
          {visibleRequests.filter((r) => r.status !== 'returned').length === 0 &&
           visibleRequests.some((r) => r.status === 'returned') && (
            <div className="text-center py-8 text-gray-400">
              <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">진행 중인 AS 건이 없습니다</p>
            </div>
          )}
        </div>
      )}

      {/* 아무것도 없을 때 */}
      {requests.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Wrench size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">접수된 AS가 없습니다</p>
        </div>
      )}
    </div>
  );
}
