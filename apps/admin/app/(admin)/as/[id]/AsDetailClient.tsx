'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Wrench, CheckCircle2, Truck, ClipboardList,
  Search, Loader2, Save, ChevronRight, AlertCircle, Edit2, X,
  ShieldCheck, ShieldOff,
} from 'lucide-react';
import { updateAsStatus, updateAsRequest, deleteAsRequest, getWarrantyBySerial } from '@/actions/asRequests';
import ShareToChat from '@/components/ShareToChat';
import type { AsStatus } from '@/lib/asConstants';
import dayjs from 'dayjs';

// ── 타입 ──

interface AsLog {
  id: string;
  status: AsStatus;
  content: string | null;
  created_by_name: string | null;
  created_at: string;
}

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
  inspection_content: string | null;
  repair_content: string | null;
  assigned_to: string | null;
  estimated_completion_at: string | null;
  completed_at: string | null;
  repair_cost: number | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
  companies: { id: string; name: string } | null;
  products: { id: string; name: string; barcode: string } | null;
  as_logs: AsLog[];
}

interface Props {
  request: AsRequest;
}

// ── 상태 설정 ──

const STATUS_CONFIG: Record<AsStatus, { label: string; color: string; bg: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  received:   { label: '접수',     color: 'text-gray-600',   bg: 'bg-gray-100',    icon: ClipboardList },
  inspecting: { label: '검수중',   color: 'text-blue-700',   bg: 'bg-blue-50',     icon: Search },
  repairing:  { label: '수리중',   color: 'text-amber-700',  bg: 'bg-amber-50',    icon: Wrench },
  completed:  { label: '수리완료', color: 'text-green-700',  bg: 'bg-green-50',    icon: CheckCircle2 },
  returned:   { label: '반납완료', color: 'text-purple-700', bg: 'bg-purple-50',   icon: Truck },
};

const STATUS_ORDER: AsStatus[] = ['received', 'inspecting', 'repairing', 'completed', 'returned'];

const NEXT_STATUS: Partial<Record<AsStatus, AsStatus>> = {
  received:   'inspecting',
  inspecting: 'repairing',
  repairing:  'completed',
  completed:  'returned',
};

const NEXT_STATUS_LABEL: Partial<Record<AsStatus, string>> = {
  received:   '검수 시작',
  inspecting: '수리 시작',
  repairing:  '수리 완료',
  completed:  '반납 완료',
};

export default function AsDetailClient({ request }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 수리내용 편집
  const [editingRepair, setEditingRepair] = useState(false);
  const [repairContent, setRepairContent] = useState(request.repair_content ?? '');

  // 상태 변경 메모
  const [statusMemo, setStatusMemo] = useState('');
  const [showStatusMemo, setShowStatusMemo] = useState(false);

  // 보증 현황
  const [warranty, setWarranty] = useState<{
    shippedAt: string | null;
    companyName: string | null;
    orderNumber: string | null;
  } | null | 'loading'>('loading');

  useEffect(() => {
    if (!request.serial_number) { setWarranty(null); return; }
    getWarrantyBySerial(request.serial_number)
      .then((result) => {
        if (!result) { setWarranty(null); return; }
        setWarranty({
          shippedAt: result.shippedAt,
          companyName: result.companyName,
          orderNumber: result.orderNumber,
        });
      })
      .catch(() => setWarranty(null));
  }, [request.serial_number]);

  // 정보 편집
  const [editingInfo, setEditingInfo] = useState(false);
  const [editAssigned, setEditAssigned] = useState(request.assigned_to ?? '');
  const [editCost, setEditCost] = useState(request.repair_cost?.toString() ?? '');
  const [editEstimated, setEditEstimated] = useState(request.estimated_completion_at ?? '');
  const [editMemo, setEditMemo] = useState(request.memo ?? '');

  const cfg = STATUS_CONFIG[request.status];
  const Icon = cfg.icon;
  const nextStatus = NEXT_STATUS[request.status];
  const isOverdue = request.estimated_completion_at &&
    !request.completed_at &&
    dayjs(request.estimated_completion_at).isBefore(dayjs(), 'day');

  function handleStatusChange(status: AsStatus) {
    startTransition(async () => {
      const result = await updateAsStatus(request.id, status, statusMemo || undefined);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${STATUS_CONFIG[status].label}으로 변경`);
        setStatusMemo('');
        setShowStatusMemo(false);
        router.refresh();
      }
    });
  }

  function handleSaveRepair() {
    startTransition(async () => {
      const result = await updateAsRequest(request.id, { repair_content: repairContent });
      if (result.error) toast.error(result.error);
      else {
        toast.success('수리 내용 저장');
        setEditingRepair(false);
        router.refresh();
      }
    });
  }

  function handleSaveInfo() {
    startTransition(async () => {
      const result = await updateAsRequest(request.id, {
        assigned_to: editAssigned || undefined,
        repair_cost: editCost ? Number(editCost) : null,
        estimated_completion_at: editEstimated || undefined,
        memo: editMemo || undefined,
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success('저장 완료');
        setEditingInfo(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm('이 AS 요청서를 삭제하시겠습니까?')) return;
    startTransition(async () => {
      const result = await deleteAsRequest(request.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success('삭제 완료');
        router.push('/as');
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/as" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <ArrowLeft size={18} className="text-gray-600" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-400">{request.number}</span>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${cfg.bg} ${cfg.color}`}>
                <Icon size={11} />
                {cfg.label}
              </span>
              {isOverdue && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-600 shrink-0">
                  <AlertCircle size={11} />
                  기한 초과
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-gray-900 mt-0.5 truncate">{request.product_name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-10 sm:pl-0 sm:ml-auto shrink-0">
          <ShareToChat entityType="as" entityId={request.id} label={request.number ?? request.product_name ?? 'A/S'} />
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>

      {/* 워크플로우 진행 표시 */}
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between">
          {STATUS_ORDER.map((s, i) => {
            const sCfg = STATUS_CONFIG[s];
            const SIcon = sCfg.icon;
            const currentIdx = STATUS_ORDER.indexOf(request.status);
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;

            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${
                    isCurrent ? 'bg-gray-900 text-white' :
                    isDone ? 'bg-green-500 text-white' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {isDone ? <CheckCircle2 size={16} /> : <SIcon size={16} />}
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight ${
                    isCurrent ? 'text-gray-900' : isDone ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {sCfg.label}
                  </span>
                </div>
                {i < STATUS_ORDER.length - 1 && (
                  <div className={`h-px flex-1 mx-1 mb-5 ${
                    i < currentIdx ? 'bg-green-400' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            );
          })}
        </div>

        {/* 상태 변경 */}
        <div className="mt-4 pt-4 border-t space-y-3">
          {/* 접수 → 검수 시작: 검수 페이지로 이동 */}
          {request.status === 'received' && (
            <div className="flex items-center gap-2">
              <Link
                href={`/as/${request.id}/inspect`}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Search size={15} />
                검수 시작
              </Link>
              <span className="text-xs text-gray-400">→ 검수 내용 입력 페이지로 이동</span>
            </div>
          )}

          {/* 검수중: 검수 페이지로 이동 안내 */}
          {request.status === 'inspecting' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 text-sm">
                <Search size={15} className="shrink-0" />
                검수가 진행 중입니다. 검수 내용을 입력하고 완료해주세요.
              </div>
              <Link
                href={`/as/${request.id}/inspect`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <ChevronRight size={15} />
                검수 계속하기
              </Link>
            </div>
          )}

          {/* 수리중 / 수리완료: 일반 상태 전환 */}
          {(request.status === 'repairing' || request.status === 'completed') && nextStatus && (
            showStatusMemo ? (
              <div className="space-y-2">
                <textarea
                  value={statusMemo}
                  onChange={(e) => setStatusMemo(e.target.value)}
                  rows={2}
                  placeholder="메모 (선택사항)"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowStatusMemo(false)}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(nextStatus)}
                    disabled={isPending}
                    className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {isPending && <Loader2 size={14} className="animate-spin" />}
                    {NEXT_STATUS_LABEL[request.status]} 처리
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowStatusMemo(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <ChevronRight size={16} />
                  {NEXT_STATUS_LABEL[request.status]}
                </button>
                <span className="text-xs text-gray-400">
                  → {STATUS_CONFIG[nextStatus].label}
                </span>
              </div>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 고객 / 제품 정보 */}
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-700">고객 · 제품</h2>
          <dl className="space-y-2 text-sm">
            {request.companies && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">거래처</dt>
                <dd className="font-medium text-gray-900">{request.companies.name}</dd>
              </div>
            )}
            {request.customer_name && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">고객명</dt>
                <dd className="text-gray-900">{request.customer_name}</dd>
              </div>
            )}
            {request.customer_phone && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">연락처</dt>
                <dd className="text-gray-900">{request.customer_phone}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="text-gray-400 w-20 shrink-0">제품명</dt>
              <dd className="font-medium text-gray-900">{request.product_name}</dd>
            </div>
            {request.serial_number && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">시리얼</dt>
                <dd className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-0.5 rounded">
                    {request.serial_number}
                  </span>
                  {warranty === 'loading' && (
                    <span className="text-xs text-gray-400">보증 조회 중…</span>
                  )}
                  {warranty !== 'loading' && (() => {
                    const shippedAt = warranty?.shippedAt ?? null;
                    if (!shippedAt) return (
                      <span className="text-xs text-gray-400">보증 대상 아님</span>
                    );
                    const daysLeft = dayjs(shippedAt).add(12, 'month').diff(dayjs(), 'day');
                    if (daysLeft < 0) return (
                      <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                        <ShieldOff size={12} /> 보증 대상 아님
                      </span>
                    );
                    return (
                      <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                        <ShieldCheck size={12} /> 보증 {daysLeft}일 남음
                      </span>
                    );
                  })()}
                </dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="text-gray-400 w-20 shrink-0">접수일시</dt>
              <dd className="text-gray-700">{dayjs(request.created_at).format('YYYY.MM.DD HH:mm')}</dd>
            </div>
          </dl>
        </div>

        {/* 처리 정보 */}
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">처리 정보</h2>
            <button
              type="button"
              onClick={() => setEditingInfo(!editingInfo)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              {editingInfo ? <X size={13} /> : <Edit2 size={13} />}
              {editingInfo ? '취소' : '편집'}
            </button>
          </div>

          {editingInfo ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">담당자</label>
                <input
                  type="text"
                  value={editAssigned}
                  onChange={(e) => setEditAssigned(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">완료 예정일</label>
                <input
                  type="date"
                  value={editEstimated}
                  onChange={(e) => setEditEstimated(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">수리 비용 (원)</label>
                <input
                  type="number"
                  min={0}
                  value={editCost}
                  onChange={(e) => setEditCost(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">비고</label>
                <input
                  type="text"
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveInfo}
                disabled={isPending}
                className="flex items-center gap-2 w-full justify-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                저장
              </button>
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">담당자</dt>
                <dd className="text-gray-900">{request.assigned_to ?? <span className="text-gray-300">미배정</span>}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">완료 예정</dt>
                <dd className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                  {request.estimated_completion_at
                    ? dayjs(request.estimated_completion_at).format('YYYY.MM.DD')
                    : <span className="text-gray-300 font-normal">미설정</span>}
                  {isOverdue && <span className="ml-1 text-xs">(초과)</span>}
                </dd>
              </div>
              {request.completed_at && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-20 shrink-0">완료일시</dt>
                  <dd className="text-green-700 font-medium">{dayjs(request.completed_at).format('YYYY.MM.DD HH:mm')}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">수리 비용</dt>
                <dd className="font-semibold text-gray-900">
                  {request.repair_cost != null
                    ? `${request.repair_cost.toLocaleString()}원`
                    : <span className="text-gray-300 font-normal">미입력</span>}
                </dd>
              </div>
              {request.memo && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-20 shrink-0">비고</dt>
                  <dd className="text-gray-700">{request.memo}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>

      {/* 고객 요청사항 */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-700">고객 요청사항</h2>
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{request.symptom}</p>
      </div>

      {/* 검수사항 */}
      <div className={`border rounded-xl p-4 space-y-3 ${
        request.status === 'inspecting' ? 'bg-blue-50 border-blue-200' : 'bg-white'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-700">검수사항</h2>
            {request.status === 'inspecting' && (
              <span className="text-[10px] font-semibold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                진행 중
              </span>
            )}
          </div>
          {(request.status === 'inspecting' || request.status === 'received') && (
            <Link
              href={`/as/${request.id}/inspect`}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
            >
              <Edit2 size={13} />
              {request.inspection_content ? '검수 수정' : '검수 입력'}
            </Link>
          )}
        </div>

        {request.inspection_content ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {request.inspection_content}
            </p>
            {request.defective_parts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {request.defective_parts.map((p) => (
                  <span key={p} className="text-xs bg-red-50 text-red-600 border border-red-100 px-2.5 py-1 rounded-full font-medium">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            {request.status === 'inspecting'
              ? '검수 내용을 입력해주세요 →'
              : '검수사항이 입력되지 않았습니다'}
          </p>
        )}
      </div>

      {/* 수리 내용 */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">수리 내용</h2>
          {!editingRepair && (
            <button
              type="button"
              onClick={() => setEditingRepair(true)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <Edit2 size={13} />
              {request.repair_content ? '수정' : '작성'}
            </button>
          )}
        </div>

        {editingRepair ? (
          <div className="space-y-2">
            <textarea
              value={repairContent}
              onChange={(e) => setRepairContent(e.target.value)}
              rows={5}
              placeholder="수리 내용, 교체 부품, 테스트 결과 등을 기록하세요"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setEditingRepair(false); setRepairContent(request.repair_content ?? ''); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveRepair}
                disabled={isPending}
                className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                저장
              </button>
            </div>
          </div>
        ) : (
          <div>
            {request.repair_content ? (
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {request.repair_content}
              </p>
            ) : (
              <p className="text-sm text-gray-300 italic">수리 내용이 아직 입력되지 않았습니다</p>
            )}
          </div>
        )}
      </div>

      {/* 처리 이력 */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-700">처리 이력</h2>

        {request.as_logs.length === 0 ? (
          <p className="text-sm text-gray-300 italic">이력이 없습니다</p>
        ) : (
          <div className="space-y-0">
            {request.as_logs.map((log, i) => {
              const lCfg = STATUS_CONFIG[log.status as AsStatus] ?? STATUS_CONFIG.received;
              const LIcon = lCfg.icon;
              const isLast = i === request.as_logs.length - 1;
              return (
                <div key={log.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${lCfg.bg}`}>
                      <LIcon size={14} className={lCfg.color} />
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-gray-100 my-1" />}
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${lCfg.color}`}>{lCfg.label}</span>
                      <span className="text-xs text-gray-400">{dayjs(log.created_at).format('MM.DD HH:mm')}</span>
                      {log.created_by_name && (
                        <span className="text-xs text-gray-400">· {log.created_by_name}</span>
                      )}
                    </div>
                    {log.content && (
                      <p className="text-sm text-gray-700 mt-0.5">{log.content}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
