'use client';

// 인박스 최상단 "내 하루" 브리핑 — 실무직원이 아침에 열면
// "오늘 뭘 해야 하는지(할 일) + 뭘 알아둬야 하는지(휴가 D-day·연차)"를 먼저 본다.
// 데이터는 getMyDayBriefing()이 조합해서 넘겨준다. 여기선 표시·이동만.

import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import {
  Sun, CheckCircle2, Stamp, Hourglass, TreePalm, CalendarCheck, ChevronRight, PartyPopper,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MyDayBriefing } from '@/actions/inbox';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  data: MyDayBriefing;
  onReviewApprovals: () => void;  // "승인 대기" 클릭 → 긴급 탭으로 이동
}

export default function InboxMyDay({ data, onReviewApprovals }: Props) {
  const router = useRouter();
  const now = dayjs();
  const { name, approvalsToReview, myPendingLeaves, nextLeave, leaveBalance, holidayName } = data;

  // 경비 결재 대기는 아래 "내 경비 진행" 카드가 이미 상세히 보여주므로 여기선 중복 표시하지 않는다.
  const hasTodo = approvalsToReview > 0 || myPendingLeaves > 0;
  const hasAwareness = !!nextLeave || (leaveBalance && leaveBalance.granted > 0);

  const hour = now.hour();
  const greeting = hour < 6 ? '아직 이른 시간이네요' : hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '오늘 하루도 수고 많으셨어요';

  return (
    <div className="rounded-xl border bg-gradient-to-br from-indigo-50/70 to-white p-4 sm:p-5">
      {/* 인사 + 오늘 날짜 */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-500">
          <Sun size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-900">
            {name}님, {greeting}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            <span>{now.format('M월 D일')} ({DAY_LABELS[now.day()]})</span>
            {holidayName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">
                <PartyPopper size={11} /> {holidayName}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 내 할 일 — 오늘 처리해야 하는 액션 */}
      <div className="mt-3.5">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">내 할 일</p>
        {hasTodo ? (
          <div className="flex flex-wrap gap-1.5">
            {approvalsToReview > 0 && (
              <button
                onClick={onReviewApprovals}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
              >
                <Stamp size={14} />
                결재 승인 {approvalsToReview}건 대기
                <ChevronRight size={14} className="opacity-60" />
              </button>
            )}
            {myPendingLeaves > 0 && (
              <button
                onClick={() => router.push('/attendance/leaves')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
              >
                <Hourglass size={14} />
                내 휴가 신청 {myPendingLeaves}건 결재 대기중
              </button>
            )}
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 size={14} /> 지금 처리할 결재가 없습니다
          </p>
        )}
      </div>

      {/* 알아두기 — 내 휴가 D-day · 연차 잔여 */}
      {hasAwareness && (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-indigo-100/70 pt-3">
          {nextLeave && (
            <button
              onClick={() => router.push('/attendance/leaves')}
              className="inline-flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900"
            >
              <TreePalm size={15} className="text-sky-500" />
              {nextLeave.onLeaveToday ? (
                <span className="font-semibold text-sky-600">오늘 휴가 중</span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-semibold text-gray-900">다음 휴가</span>
                  <span className={cn(
                    'rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums',
                    nextLeave.dday <= 3 ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600',
                  )}>
                    {nextLeave.dday === 0 ? 'D-DAY' : `D-${nextLeave.dday}`}
                  </span>
                </span>
              )}
              <span className="text-xs text-gray-400">
                {dayjs(nextLeave.start_date).format('M/D')}
                {nextLeave.start_date !== nextLeave.end_date && `~${dayjs(nextLeave.end_date).format('M/D')}`}
                {' '}{nextLeave.label}
              </span>
            </button>
          )}
          {leaveBalance && leaveBalance.granted > 0 && (
            <button
              onClick={() => router.push('/attendance/leaves')}
              className="inline-flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900"
            >
              <CalendarCheck size={15} className="text-emerald-500" />
              <span className="font-semibold text-gray-900">연차</span>
              <span className="tabular-nums">
                <b className={cn(leaveBalance.remaining <= 3 ? 'text-amber-600' : 'text-emerald-600')}>
                  {leaveBalance.remaining}일
                </b>
                <span className="text-xs text-gray-400"> 남음 / {leaveBalance.granted}일</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
