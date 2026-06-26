'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Search, CheckCircle2, Loader2 } from 'lucide-react';
import { completeInspection, updateAsStatus } from '@/actions/asRequests';
import { DEFECTIVE_PART_OPTIONS } from '@/lib/asConstants';
import type { AsStatus } from '@/lib/asConstants';

interface AsRequest {
  id: string;
  number: string;
  status: AsStatus;
  customer_name: string | null;
  product_name: string;
  serial_number: string | null;
  symptom: string;
  defective_parts: string[];
  inspection_content: string | null;
  companies: { id: string; name: string } | null;
}

interface Props {
  request: AsRequest;
  currentUserName: string;
}

export default function InspectClient({ request, currentUserName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [inspectionContent, setInspectionContent] = useState(request.inspection_content ?? '');
  const [selectedParts, setSelectedParts] = useState<string[]>(request.defective_parts ?? []);
  const [customPart, setCustomPart] = useState('');

  // 접수 상태로 들어왔으면 먼저 검수중으로 전환
  const [statusReady, setStatusReady] = useState(request.status === 'inspecting');

  function togglePart(part: string) {
    setSelectedParts((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part],
    );
  }

  function addCustomPart() {
    const trimmed = customPart.trim();
    if (!trimmed || selectedParts.includes(trimmed)) return;
    setSelectedParts((prev) => [...prev, trimmed]);
    setCustomPart('');
  }

  function handleStartInspection() {
    startTransition(async () => {
      const result = await updateAsStatus(request.id, 'inspecting', '검수 시작', currentUserName || '검수자');
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStatusReady(true);
    });
  }

  function handleComplete() {
    if (!inspectionContent.trim()) {
      toast.error('고장 진단 내용을 입력해주세요');
      return;
    }
    startTransition(async () => {
      const result = await completeInspection(request.id, inspectionContent, selectedParts, currentUserName || '검수자');
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('검수 완료 — 수리팀으로 넘어갑니다');
      router.push(`/as/${request.id}`);
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href={`/as/${request.id}`}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </Link>
        <div>
          <p className="text-xs text-gray-400 font-mono">{request.number}</p>
          <h1 className="text-lg font-bold text-gray-900">{request.product_name}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {currentUserName && (
            <span className="text-xs text-gray-500">검수자: <strong>{currentUserName}</strong></span>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            <Search size={12} />
            검수 단계
          </span>
        </div>
      </div>

      {/* 고객 요청사항 (참조용) */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">고객 요청사항</p>
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{request.symptom}</p>
        {request.companies && (
          <p className="text-xs text-gray-400">거래처: {request.companies.name}</p>
        )}
        {request.customer_name && (
          <p className="text-xs text-gray-400">고객명: {request.customer_name}</p>
        )}
        {request.serial_number && (
          <p className="text-xs text-gray-400 font-mono">S/N: {request.serial_number}</p>
        )}
      </div>

      {/* 검수 시작 전: 검수 시작 버튼 */}
      {!statusReady && (
        <div className="bg-white border rounded-xl p-6 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
            <Search size={26} className="text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-800">검수를 시작하시겠습니까?</p>
            <p className="text-sm text-gray-400 mt-1">검수 시작 후 고장 내용을 입력해주세요</p>
          </div>
          <button
            type="button"
            onClick={handleStartInspection}
            disabled={isPending}
            className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending && <Loader2 size={16} className="animate-spin" />}
            검수 시작
          </button>
        </div>
      )}

      {/* 검수 시작 후: 검수 입력 폼 */}
      {statusReady && (
        <div className="space-y-5">
          {/* 고장 진단 내용 */}
          <div className="bg-white border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-800">고장 진단 내용</h2>
              <span className="text-red-500 text-xs font-semibold">필수</span>
            </div>
            <textarea
              value={inspectionContent}
              onChange={(e) => setInspectionContent(e.target.value)}
              rows={6}
              placeholder={`검수한 결과를 상세히 입력하세요\n\n예) 충전 포트 핀 부식 확인. 배터리 완전 방전 상태. 외부 충격 흔적 없음.`}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* 고장 부위 선택 */}
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-800">고장 부위</h2>
            <div className="flex flex-wrap gap-2">
              {DEFECTIVE_PART_OPTIONS.map((part) => (
                <button
                  key={part}
                  type="button"
                  onClick={() => togglePart(part)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selectedParts.includes(part)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {part}
                </button>
              ))}
            </div>

            {/* 직접 입력 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customPart}
                onChange={(e) => setCustomPart(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomPart()}
                placeholder="직접 입력 후 Enter"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addCustomPart}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                추가
              </button>
            </div>

            {/* 선택된 부위 */}
            {selectedParts.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">선택된 고장 부위 ({selectedParts.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedParts.map((part) => (
                    <span
                      key={part}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100"
                    >
                      {part}
                      <button
                        type="button"
                        onClick={() => togglePart(part)}
                        className="ml-0.5 hover:text-red-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 검수 완료 버튼 */}
          <div className="flex gap-3">
            <Link
              href={`/as/${request.id}`}
              className="px-6 py-3 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              나중에 계속
            </Link>
            <button
              type="button"
              onClick={handleComplete}
              disabled={isPending || !inspectionContent.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              {isPending
                ? <Loader2 size={16} className="animate-spin" />
                : <CheckCircle2 size={16} />}
              검수 완료 — 수리팀으로 넘기기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
