'use client';

// 통합 인박스 피드 — 멘션 · 레코드 스레드 활동 · ERP 긴급 이벤트.
// 각 항목 클릭 시 그 일이 일어난 곳(레코드 상세 / 채팅 채널 / ERP 화면)으로 이동한다.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import {
  Inbox, AtSign, MessagesSquare, AlertTriangle, Hash, User, Bot, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { entityHref, entityChipClass, ENTITY_LABEL } from '@/lib/entityLink';
import type { MyMention, RecordActivity } from '@/actions/chat';
import type { UrgentItem } from '@/actions/dashboard';

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

type Tab = 'all' | 'mentions' | 'records' | 'urgent';

interface FeedItem {
  key: string;
  kind: 'mention' | 'record' | 'urgent';
  title: string;            // 누가 / 무엇이
  where: string | null;     // 어디서 (#채널, 레코드 라벨)
  body: string;
  time: string | null;      // ISO — urgent는 null
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
  chatEnabled: boolean;
}

export default function InboxClient({ mentions, activity, urgent, chatEnabled }: Props) {
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

    // 긴급은 맨 위 고정
    const urgentItems: FeedItem[] = urgent.map((u) => ({
      key: `urgent-${u.id}`,
      kind: 'urgent',
      title: u.label,
      where: null,
      body: u.sub,
      time: null,
      unread: u.level === 'high',
      isSystem: true,
      href: u.href,
      entityType: null,
      entityLabel: null,
    }));

    return [...urgentItems, ...list];
  }, [mentions, activity, urgent]);

  const filtered = items.filter((i) => {
    if (tab === 'all') return true;
    if (tab === 'mentions') return i.kind === 'mention';
    if (tab === 'records') return i.kind === 'record';
    return i.kind === 'urgent';
  });

  const counts = {
    all: items.length,
    mentions: items.filter((i) => i.kind === 'mention').length,
    records: items.filter((i) => i.kind === 'record').length,
    urgent: items.filter((i) => i.kind === 'urgent').length,
  };

  const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { key: 'all', label: '전체', icon: Inbox },
    { key: 'mentions', label: '멘션', icon: AtSign },
    { key: 'records', label: '레코드 대화', icon: MessagesSquare },
    { key: 'urgent', label: '긴급', icon: AlertTriangle },
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
          나에게 온 멘션 · 레코드 대화 · 긴급 처리를 한눈에
        </p>
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

              {/* 아이콘 — 긴급은 알림 색, 시스템은 봇, 나머지는 이름 이니셜 아바타 */}
              {item.kind === 'urgent' ? (
                <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-sm">
                  <AlertTriangle size={16} />
                </span>
              ) : item.isSystem ? (
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
