'use client';

// 통합 인박스 — "오늘의 업무"(실제 ERP 처리 대상)를 상단 보드로 한눈에 보여주고,
// 아래는 소통 피드(멘션·레코드 대화)로 분리한다. 각 항목 클릭 시 그 레코드/채널로 이동.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import {
  Inbox, AtSign, MessagesSquare, Hash, User, Bot, ChevronRight,
  TreePalm, CircleMinus, CalendarDays, CircleEllipsis, Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { entityHref, entityChipClass, ENTITY_LABEL } from '@/lib/entityLink';
import type { MyMention, RecordActivity } from '@/actions/chat';
import type { UrgentItem } from '@/actions/dashboard';
import type { TeamSnapshot } from '@/actions/presence';
import type { MyExpenseFlowItem } from '@/actions/expenses';
import type { MyDayBriefing, ManagerAttendanceSnapshot } from '@/actions/inbox';
import InboxAttendance, { type InboxAttendanceData } from './InboxAttendance';
import InboxMyDay from './InboxMyDay';
import InboxWorkBoard from './InboxWorkBoard';
import InboxTeamAttendance from './InboxTeamAttendance';

// 사람 이름 → 항상 같은 색 아바타 (순수 표시용 — 데이터/구조는 안 건드림)
const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-sky-500', 'bg-violet-500', 'bg-teal-500', 'bg-orange-500',
];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type Tab = 'all' | 'mentions' | 'records';

interface FeedItem {
  key: string;
  kind: 'mention' | 'record';
  title: string;            // 누가 / 무엇이
  where: string | null;     // 어디서 (#채널, 레코드 라벨)
  body: string;
  time: string | null;      // ISO
  unread: boolean;
  isSystem: boolean;
  href: string;
  entityType: string | null;
  entityLabel: string | null;
}

interface Props {
  mentions: MyMention[];
  activity: RecordActivity[];
  urgent: UrgentItem[];
  snapshot: TeamSnapshot;
  attendance: InboxAttendanceData | null;
  myExpenses: MyExpenseFlowItem[];
  briefing: MyDayBriefing | null;
  teamAttendance: ManagerAttendanceSnapshot | null;
  chatEnabled: boolean;
}

export default function InboxClient({ mentions, activity, urgent, snapshot, attendance, myExpenses, briefing, teamAttendance, chatEnabled }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');

  const items = useMemo<FeedItem[]>(() => {
    const list: FeedItem[] = [];

    for (const m of mentions) {
      const isRecord = !!m.entity_type && !!m.entity_id;
      list.push({
        key: `mention-${m.message_id}`,
        kind: 'mention',
        title: m.author_name ?? '사용자',
        where: isRecord
          ? (m.entity_label ?? m.channel_name)
          : m.channel_kind === 'dm' ? 'DM' : (m.channel_name ? `#${m.channel_name}` : '채팅'),
        body: m.body,
        time: m.created_at,
        unread: m.is_unread,
        isSystem: false,
        href: isRecord
          ? entityHref(m.entity_type!, m.entity_id!)
          : m.channel_id ? `/chat?channel=${m.channel_id}` : '/chat',
        entityType: m.entity_type,
        entityLabel: m.entity_label,
      });
    }

    for (const a of activity) {
      // 멘션과 중복되는 메시지는 멘션 쪽만 남긴다
      if (list.some((i) => i.key === `mention-${a.message_id}`)) continue;
      list.push({
        key: `record-${a.message_id}`,
        kind: 'record',
        title: a.author_name ?? '사용자',
        where: a.entity_label ?? '레코드',
        body: a.body,
        time: a.created_at,
        unread: a.is_unread,
        isSystem: a.is_system,
        href: a.entity_type && a.entity_id ? entityHref(a.entity_type, a.entity_id) : '#',
        entityType: a.entity_type,
        entityLabel: a.entity_label,
      });
    }

    // 시간순 정렬 (멘션+레코드)
    list.sort((x, y) => dayjs(y.time ?? 0).valueOf() - dayjs(x.time ?? 0).valueOf());

    return list;
  }, [mentions, activity]);

  const filtered = items.filter((i) => {
    if (tab === 'all') return true;
    if (tab === 'mentions') return i.kind === 'mention';
    return i.kind === 'record';
  });

  const counts = {
    all: items.length,
    mentions: items.filter((i) => i.kind === 'mention').length,
    records: items.filter((i) => i.kind === 'record').length,
  };

  const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { key: 'all', label: '전체', icon: Inbox },
    { key: 'mentions', label: '멘션', icon: AtSign },
    { key: 'records', label: '레코드 대화', icon: MessagesSquare },
  ];

  function open(item: FeedItem) {
    if (item.href && item.href !== '#') router.push(item.href);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
          <Inbox size={20} className="text-gray-400" />
          인박스
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {attendance ? '출퇴근 · ' : ''}오늘의 업무 · 멘션 · 레코드 대화를 한눈에
        </p>
      </div>

      {/* 내 하루 — 오늘 할 일(승인 대기·내 신청) + 알아둘 것(휴가 D-day·연차) */}
      {briefing && (
        <InboxMyDay
          data={briefing}
          onReviewApprovals={() =>
            document.getElementById('inbox-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      )}

      {/* 내 근태 — 로그인 후 첫 화면에서 바로 출퇴근 */}
      {attendance && <InboxAttendance data={attendance} />}

      {/* 오늘 팀 출근 현황 — 근태 관리자에게만 (휴가자 제외 미출근 강조) */}
      {teamAttendance && <InboxTeamAttendance data={teamAttendance} />}

      {/* 오늘의 업무 — 실제 ERP 처리 대상(승인·수주·견적·A/S·재고)을 한눈에 */}
      <InboxWorkBoard items={urgent} />

      {/* 내 경비 진행 — 승인 상태에 따라 유기적으로 표시(결재 대기·지급 대기), 완료되면 사라짐 */}
      {myExpenses.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <Receipt size={13} /> 내 경비 진행
            </p>
            <button
              onClick={() => router.push('/expenses')}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              내 경비 <ChevronRight size={13} />
            </button>
          </div>
          <div className="space-y-1.5">
            {myExpenses.map((e) => (
              <button
                key={e.id}
                onClick={() => router.push(`/expenses/${e.id}`)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">{e.title}</span>
                  <span className="block text-xs text-gray-400">{e.total_amount.toLocaleString()}원</span>
                </span>
                <span className={cn(
                  'flex-shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                  e.stage === 'pending'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                )}>
                  {e.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 오늘의 팀 — 휴가·자리비움·다가오는 휴가·진행 중 결재 한눈에 */}
      {(snapshot.onLeave.length > 0 || snapshot.away.length > 0 || snapshot.upcoming.length > 0 || snapshot.pending.length > 0) && (
        <div className="rounded-xl border bg-white p-4 space-y-2.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">오늘의 팀</p>

          {snapshot.onLeave.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-gray-500 w-24 flex-shrink-0">
                <TreePalm size={13} className="text-sky-500" /> 휴가 중
              </span>
              {snapshot.onLeave.map((p) => (
                <span key={p.user_id} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                  {p.name} · {p.label}
                </span>
              ))}
            </div>
          )}

          {snapshot.away.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-gray-500 w-24 flex-shrink-0">
                <CircleMinus size={13} className="text-amber-500" /> 자리비움
              </span>
              {snapshot.away.map((p) => (
                <span key={p.user_id} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {p.name} · {p.label}
                </span>
              ))}
            </div>
          )}

          {snapshot.upcoming.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-gray-500 w-24 flex-shrink-0">
                <CalendarDays size={13} className="text-gray-400" /> 예정 휴가
              </span>
              {snapshot.upcoming.map((u, i) => (
                <span key={i} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                  {dayjs(u.start_date).format('M/D')}
                  {u.start_date !== u.end_date && `~${dayjs(u.end_date).format('M/D')}`} {u.name} · {u.label}
                </span>
              ))}
            </div>
          )}

          {snapshot.pending.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-gray-500 w-24 flex-shrink-0">
                <CircleEllipsis size={13} className="text-violet-500" /> 결재 진행
              </span>
              {snapshot.pending.map((p) => (
                <button
                  key={`${p.entity_type}-${p.entity_id}`}
                  onClick={() => {
                    const href = entityHref(p.entity_type, p.entity_id);
                    if (href && href !== '#') router.push(href);
                  }}
                  className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                  title={`승인자: ${p.approver}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 소통 — 멘션 · 레코드 대화 (업무 보드와 시각적으로 구분) */}
      <div className="flex items-center gap-2 pt-1">
        <MessagesSquare size={15} className="text-gray-400" />
        <p className="text-sm font-bold text-gray-900">대화 · 멘션</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all',
              tab === key
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
            )}
          >
            <Icon size={14} />
            {label}
            {counts[key] > 0 && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                tab === key ? 'bg-white/20 text-white' : 'bg-white text-gray-500',
              )}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 피드 */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-white py-14 text-center">
          <Inbox size={28} className="mx-auto text-gray-200" />
          <p className="mt-2 text-sm text-gray-400">
            {tab === 'mentions' && !chatEnabled
              ? 'chat 모듈이 꺼져 있습니다'
              : '표시할 항목이 없습니다'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white divide-y">
          {filtered.map((item) => (
            <button
              key={item.key}
              onClick={() => open(item)}
              className={cn(
                'relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50',
                item.unread && 'bg-blue-50/40',
              )}
            >
              {item.unread && (
                <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-blue-500" />
              )}

              {/* 아이콘 — 시스템(봇)은 봇 아이콘, 나머지는 이름 이니셜 아바타 */}
              {item.isSystem ? (
                <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-400">
                  <Bot size={15} />
                </span>
              ) : (
                <span className={cn(
                  'mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                  avatarColor(item.title),
                )}>
                  {item.title.slice(0, 1)}
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5 flex-wrap">
                  <span className={cn('text-sm', item.unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-700')}>
                    {item.title}
                  </span>
                  {item.kind === 'mention' && (
                    <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600">멘션</span>
                  )}
                  {item.where && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                      {item.kind === 'mention' && !item.entityType && (item.where === 'DM' ? <User size={10} /> : <Hash size={10} />)}
                      {item.entityType && (
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', entityChipClass(item.entityType))}>
                          {ENTITY_LABEL[item.entityType] ?? item.entityType}
                        </span>
                      )}
                      {item.where}
                    </span>
                  )}
                  {item.time && (
                    <span className="ml-auto flex-shrink-0 text-[11px] text-gray-300">
                      {dayjs(item.time).format('MM.DD HH:mm')}
                    </span>
                  )}
                </span>
                <span className={cn(
                  'mt-0.5 block truncate text-sm',
                  item.isSystem ? 'text-gray-400' : 'text-gray-600',
                )}>
                  {item.body}
                </span>
              </span>

              <ChevronRight size={14} className="mt-2.5 flex-shrink-0 text-gray-300" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
