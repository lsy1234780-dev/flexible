'use client';

// 인박스 관리자 위젯 — 오늘 팀 출근 현황.
// "근무시간인데 휴가자 빼고 다 출근했나"를 인박스에서 바로 확인. 근태 관리자에게만 렌더된다.
// 데이터는 getManagerAttendanceSnapshot()이 계산해 넘겨준다. 여기선 표시·이동만.

import { useRouter } from 'next/navigation';
import { Users, LogIn, TreePalm, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ManagerAttendanceSnapshot } from '@/actions/inbox';

export default function InboxTeamAttendance({ data }: { data: ManagerAttendanceSnapshot }) {
  const router = useRouter();
  const { isWorkday, pastStart, standardStart, total, working, done, onLeave, notIn } = data;

  // "출근 전" 강조 조건: 근무일 + 표준 출근시각 지남 + 실제로 안 찍은 사람 존재
  const highlightNotIn = isWorkday && pastStart && notIn.length > 0;
  const allIn = isWorkday && pastStart && notIn.length === 0;

  return (
    <button
      onClick={() => router.push('/attendance/team')}
      className="block w-full rounded-xl border bg-white p-4 text-left transition-colors hover:bg-gray-50"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <Users size={16} className="text-gray-400" /> 오늘 팀 출근 현황
        </p>
        <span className="flex items-center gap-0.5 text-xs font-medium text-gray-400">
          팀 근태 <ChevronRight size={13} />
        </span>
      </div>

      {/* 집계 칩 — 근무 / 완료 / 휴가 / 출근 전 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
          <LogIn size={12} /> 근무 {working}
        </span>
        {done > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
            <CheckCircle2 size={12} /> 퇴근 {done}
          </span>
        )}
        {onLeave > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
            <TreePalm size={12} /> 휴가 {onLeave}
          </span>
        )}
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
          highlightNotIn
            ? 'border-amber-300 bg-amber-100 text-amber-800'
            : 'border-gray-200 bg-gray-50 text-gray-500',
        )}>
          <AlertTriangle size={12} /> 출근 전 {notIn.length}
        </span>
        <span className="ml-auto text-[11px] text-gray-300 tabular-nums">전체 {total}명</span>
      </div>

      {/* 근무시간인데 안 찍은 사람 — 이름으로 강조 */}
      {highlightNotIn && (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-amber-100 pt-2.5 text-xs">
          <span className="font-semibold text-amber-700">
            {standardStart} 지났는데 미출근:
          </span>
          {notIn.map((m) => (
            <span key={m.user_id} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
              {m.name}
            </span>
          ))}
        </p>
      )}

      {/* 전원 출근 완료 — 안심 메시지 */}
      {allIn && (
        <p className="mt-2.5 flex items-center gap-1.5 border-t border-emerald-100 pt-2.5 text-xs font-medium text-emerald-600">
          <CheckCircle2 size={13} /> 휴가자 제외 전원 출근 완료
        </p>
      )}
    </button>
  );
}
