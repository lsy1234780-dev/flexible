'use client';

// 인박스 중심 "오늘의 업무" 보드 — 실무직원/관리자가 열자마자 "오늘 쳐낼 일"이 한눈에 스캔된다.
// getUrgentItems()가 만드는 실제 ERP 업무(승인·수주·견적·A/S·재고)를 카테고리별로 묶어 보여준다.
// 데이터/판정은 dashboard.ts가 이미 하고, 여기선 분류·표시·이동만.

import { useRouter } from 'next/navigation';
import {
  ClipboardCheck, Stamp, Wrench, FileText, PackageX, Clock, Receipt,
  ChevronRight, CheckCircle2, ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UrgentItem } from '@/actions/dashboard';

type Kind = UrgentItem['kind'];

// 카테고리별 라벨·아이콘·색 (한 곳에서만 정의)
const KIND_META: Record<Kind, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; chip: string; dot: string }> = {
  approval:   { label: '승인',  icon: Stamp,          chip: 'bg-red-50 text-red-700 border-red-200',        dot: 'bg-red-500' },
  order:      { label: '수주',  icon: ClipboardCheck, chip: 'bg-blue-50 text-blue-700 border-blue-200',     dot: 'bg-blue-500' },
  quote:      { label: '견적',  icon: FileText,       chip: 'bg-teal-50 text-teal-700 border-teal-200',     dot: 'bg-teal-500' },
  as:         { label: 'A/S',   icon: Wrench,         chip: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  stock:      { label: '재고',  icon: PackageX,       chip: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  attendance: { label: '근태',  icon: Clock,          chip: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-500' },
  expense:    { label: '경비',  icon: Receipt,        chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  mentions:   { label: '멘션',  icon: Stamp,          chip: 'bg-gray-50 text-gray-600 border-gray-200',      dot: 'bg-gray-400' },
};

// 카테고리 표시 우선순위 (승인·수주가 위로)
const KIND_ORDER: Kind[] = ['approval', 'order', 'quote', 'as', 'stock', 'attendance', 'expense', 'mentions'];

export default function InboxWorkBoard({ items }: { items: UrgentItem[] }) {
  const router = useRouter();

  // 멘션(소통)은 아래 대화 피드에서, 근태 '출근 전' 현황은 전용 위젯(InboxTeamAttendance)에서
  // 각각 다루므로 업무 보드에선 제외 — 중복 표시 방지.
  const work = items.filter((i) => i.kind !== 'mentions' && i.kind !== 'attendance');

  // 카테고리별 건수 (요약 칩)
  const counts = KIND_ORDER
    .map((k) => ({ kind: k, n: work.filter((w) => w.kind === k).length }))
    .filter((c) => c.n > 0);

  // 정렬: high 먼저, 그 안에서 카테고리 우선순위
  const sorted = [...work].sort((a, b) => {
    if (a.level !== b.level) return a.level === 'high' ? -1 : 1;
    return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  });

  return (
    <div id="inbox-work" className="rounded-xl border bg-white p-4 scroll-mt-20">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <ListTodo size={16} className="text-gray-400" /> 오늘의 업무
          {work.length > 0 && (
            <span className="rounded-full bg-gray-900 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
              {work.length}
            </span>
          )}
        </p>
        {/* 카테고리 요약 칩 — 한 줄로 "뭐가 몇 건인지" */}
        {counts.length > 0 && (
          <div className="hidden flex-wrap items-center justify-end gap-1 sm:flex">
            {counts.map(({ kind, n }) => {
              const m = KIND_META[kind];
              return (
                <span key={kind} className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium', m.chip)}>
                  <m.icon size={11} /> {m.label} {n}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={15} /> 오늘 처리할 업무가 없습니다
        </p>
      ) : (
        <div className="-mx-1 divide-y">
          {sorted.map((item) => {
            const m = KIND_META[item.kind] ?? KIND_META.mentions;
            return (
              <button
                key={item.id}
                onClick={() => item.href && router.push(item.href)}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-gray-50"
              >
                <span className={cn(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                  item.level === 'high' ? `${m.dot} text-white` : 'bg-gray-100 text-gray-500',
                )}>
                  <m.icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn('rounded border px-1 py-0.5 text-[10px] font-bold', m.chip)}>{m.label}</span>
                    <span className="truncate text-sm font-semibold text-gray-900">{item.label}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-400">{item.sub}</span>
                </span>
                {item.level === 'high' && (
                  <span className="hidden flex-shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 sm:inline">
                    급함
                  </span>
                )}
                <ChevronRight size={15} className="flex-shrink-0 text-gray-300" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
