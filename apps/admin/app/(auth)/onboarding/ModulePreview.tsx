'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Building2, ShoppingCart, Package, Plus, MousePointer2, MessageCircle, X } from 'lucide-react';
import { isMenuModuleEnabled } from '@/lib/modules';
import { allNavGroups } from '@/lib/navGroups';

// @멘션 자동완성에 뜨는 엔티티 종류 — 거래처·수주·제품 등 "뭐든 멘션 가능"을 보여줌
const MENTION_SUGGESTIONS = [
  { icon: Building2, label: '대양테크', type: '거래처' },
  { icon: ShoppingCart, label: 'SO-2026-042', type: '수주' },
  { icon: Package, label: '스마트 센서 모듈 A', type: '제품' },
];

function FakeCursor({ x, y, clicking, visible }: { x: number; y: number; clicking: boolean; visible: boolean }) {
  return (
    <div
      className='pointer-events-none absolute z-50 transition-all duration-[850ms] ease-in-out'
      style={{ left: x, top: y, opacity: visible ? 1 : 0, transform: `scale(${clicking ? 0.85 : 1})` }}
    >
      <MousePointer2 className='h-5 w-5 fill-gray-900/80 text-gray-900 drop-shadow-md' />
      {clicking && <span className='absolute -inset-2.5 -z-10 animate-ping rounded-full bg-blue-400/50' />}
    </div>
  );
}

interface Props {
  enabledModules: string[];
}

interface TopBar {
  search?: string;
  tabs?: string[];
  activeTab?: number;
  primaryLabel?: string;
}

interface RecordThread {
  ref: string;
  author: string;
  text: string;
}

type MockContent =
  | { kind: 'table'; topBar?: TopBar; tiles?: { label: string; value: string }[]; columns: string[]; rows: string[][]; recordThread?: RecordThread }
  | { kind: 'stats'; tiles: { label: string; value: string }[]; calendar?: boolean }
  | { kind: 'kanban'; header: { label: string; value: string }[]; primaryLabel?: string; columns: { name: string; color: string; cards: { title: string; sub: string; value?: string }[] }[] }
  | { kind: 'groupList'; groups: { label: string; color: string; items: { title: string; sub: string; badge?: string }[] }[] }
  | { kind: 'chat' }
  | { kind: 'inbox' }
  | { kind: 'dashboard' };

// 실제 화면 뱃지 색 규칙 그대로 — 진하게 채운 필(다크)=on/노출 상태, 초록=완료·정상, 호박=대기·진행, 빨강=문제·취소, 회색=초안
const BADGE: Record<string, string> = {
  노출: 'bg-gray-900 text-white', 활성: 'bg-gray-900 text-white', 발송: 'bg-gray-900 text-white',
  완료: 'bg-emerald-50 text-emerald-700', 확정: 'bg-emerald-50 text-emerald-700', 정상: 'bg-emerald-50 text-emerald-700',
  결제완료: 'bg-emerald-50 text-emerald-700', 승인됨: 'bg-emerald-50 text-emerald-700', 무상보증: 'bg-emerald-50 text-emerald-700',
  '수리 완료': 'bg-emerald-50 text-emerald-700', '지급 완료': 'bg-emerald-50 text-emerald-700',
  대기: 'bg-amber-50 text-amber-700', '출고 대기': 'bg-amber-50 text-amber-700', '입고 대기': 'bg-amber-50 text-amber-700',
  '승인 대기': 'bg-amber-50 text-amber-700', '검수 중': 'bg-amber-50 text-amber-700', '점검 중': 'bg-amber-50 text-amber-700',
  부족: 'bg-amber-50 text-amber-700', '지급 대기': 'bg-amber-50 text-amber-700',
  미결제: 'bg-red-50 text-red-700', 취소: 'bg-red-50 text-red-700', 보증만료: 'bg-red-50 text-red-700',
  초안: 'bg-gray-100 text-gray-600', '작성 중': 'bg-gray-100 text-gray-600', 휴가: 'bg-gray-100 text-gray-600',
};

function StatusBadge({ value }: { value: string }) {
  const cls = BADGE[value];
  if (!cls) return <span>{value}</span>;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{value}</span>;
}

// href → 실제 도메인에 맞는 라이브 목업 (진짜 화면의 상단바·필터·뱃지·레코드 대화 구조를 그대로 재현)
const PREVIEW_CONTENT: Record<string, MockContent> = {
  '/inbox': { kind: 'inbox' },
  '/dashboard': { kind: 'dashboard' },
  '/products': {
    kind: 'table',
    topBar: { search: '제품명 또는 바코드 검색', primaryLabel: '+ 제품 등록' },
    columns: ['제품명', '카테고리', '바코드', '기본단가', '재고', '노출'],
    rows: [
      ['스마트 센서 모듈 A', '센서', '8801234000001', '₩45,000', '128', '노출'],
      ['로봇팔 컨트롤러', '컨트롤러', '8801234000002', '₩320,000', '32', '노출'],
      ['배터리 팩 6S', '전원', '8801234000003', '₩58,000', '210', '노출'],
    ],
  },
  '/categories': {
    kind: 'table',
    topBar: { primaryLabel: '+ 카테고리 추가' },
    columns: ['카테고리', '하위 제품 수'],
    rows: [['센서', '18'], ['컨트롤러', '9'], ['전원', '14']],
  },
  '/inventory': {
    kind: 'table',
    topBar: { search: '제품명 또는 바코드 검색' },
    tiles: [{ label: '전체 제품', value: '10' }, { label: '재고 부족', value: '2' }, { label: '출고 완료', value: '8' }],
    columns: ['제품', '카테고리', '재고', '상태'],
    rows: [
      ['스마트 센서 모듈 A', '센서', '128', '정상'],
      ['로봇팔 컨트롤러', '컨트롤러', '32', '부족'],
    ],
  },
  '/lots': {
    kind: 'table',
    topBar: { search: 'LOT·제품·바코드 검색', primaryLabel: '+ LOT 생성' },
    columns: ['LOT 번호', '제품', '수량', '입고일'],
    rows: [
      ['LOT-2026-014', '배터리 팩 6S', '210', '2026-06-28'],
      ['LOT-2026-013', '스마트 센서 모듈 A', '128', '2026-06-20'],
    ],
  },
  '/companies': {
    kind: 'table',
    topBar: { tabs: ['전체', '대기', '활성', '정지'], activeTab: 0, primaryLabel: '+ 거래처 등록' },
    columns: ['거래처', '구분', '상태', '등록일'],
    rows: [
      ['대양테크', '고객사', '활성', '2026-01-05'],
      ['해솔전자', '고객사', '활성', '2026-02-10'],
      ['미래산업', '고객사', '승인 대기', '2026-07-01'],
    ],
    recordThread: { ref: '대양테크', author: '박주임', text: '이번 분기 할인 정책 공유드려요' },
  },
  '/receiving': {
    kind: 'table',
    topBar: { primaryLabel: '+ 새 발주' },
    columns: ['PO#', '제목', '공급처', '금액', '결제'],
    rows: [
      ['PO-2026-021', '라벨 프린터 재입고', '한국포장자재', '₩12,400,000', '미결제'],
      ['PO-2026-020', '스캐너 부품 발주', '대한전자부품', '₩6,800,000', '결제완료'],
    ],
  },
  '/orders': {
    kind: 'table',
    topBar: { tabs: ['전체', '접수', '확정', '출고', '완료', '취소'], activeTab: 0, search: '발주번호 또는 업체명 검색' },
    columns: ['수주번호', '거래처', '금액', '상태'],
    rows: [
      ['SO-2026-042', '대양테크', '₩4,180,000', '출고 대기'],
      ['SO-2026-041', '해솔전자', '₩2,950,000', '확정'],
    ],
    recordThread: { ref: 'SO-2026-042', author: '김대리', text: '방금 확정했고 재고 차감까지 완료했어요' },
  },
  '/quotations': {
    kind: 'table',
    topBar: { tabs: ['전체', '초안', '발송', '확정'], activeTab: 0, primaryLabel: '+ 견적서 작성' },
    columns: ['견적번호', '업체명', '발행일', '상태'],
    rows: [
      ['Q-2026-118', '대양테크', '2026-07-01', '발송'],
      ['Q-2026-117', '미래산업', '2026-06-28', '초안'],
    ],
  },
  '/chat': { kind: 'chat' },
  '/deals': {
    kind: 'kanban',
    header: [{ label: '열린 딜', value: '₩80,000,000' }, { label: '가중 예측', value: '₩27,200,000' }, { label: '계약', value: '₩0' }],
    primaryLabel: '+ 딜 추가',
    columns: [
      { name: '리드', color: '#94a3b8', cards: [] },
      { name: '제안', color: '#3b82f6', cards: [{ title: '로봇팔 신규 도입', sub: 'DD테크', value: '₩58,000,000' }] },
      { name: '협상', color: '#f59e0b', cards: [{ title: '하반기 센서 공급', sub: 'AA유통', value: '₩22,000,000' }] },
      { name: '계약 완료', color: '#22c55e', cards: [] },
    ],
  },
  '/warranty': {
    kind: 'table',
    topBar: { tabs: ['전체', '보증중', '만료'], activeTab: 0 },
    columns: ['제품명', '시리얼', '납품업체', '보증현황'],
    rows: [
      ['로봇팔 컨트롤러', 'SN-BT100-001', '대양테크', '무상보증'],
      ['배터리 팩 6S', 'SN-LP400-001', '해솔전자', '보증만료'],
    ],
  },
  '/as': {
    kind: 'groupList',
    groups: [
      { label: '검수 대기', color: '#f59e0b', items: [{ title: '산업용 PDA 단말기 P-600', sub: '한국물류(주) · 박영희 · 스캔 후 데이터가 전달되지 않음', badge: '검수 중' }] },
      { label: '수리 진행 중', color: '#3b82f6', items: [{ title: '무선 바코드 스캐너 BT-100', sub: 'AA유통 · 김철수 · 전원이 켜지지 않음', badge: '점검 중' }] },
      { label: '수리 완료 — 반납 대기', color: '#22c55e', items: [{ title: '프린터 LP-50', sub: '라벨 프린트 시 줄무늬 발생', badge: '수리 완료' }] },
    ],
  },
  '/warehouses': {
    kind: 'table',
    topBar: { primaryLabel: '+ 창고 추가' },
    columns: ['창고명', '위치', '보관 품목'],
    rows: [['본사 1창고', '경기 화성', '482종'], ['본사 2창고', '인천', '210종']],
  },
  '/serials': {
    kind: 'table',
    topBar: { search: '제품명 또는 바코드 검색' },
    columns: ['시리얼번호', '제품', '상태'],
    rows: [['SN-9931002', '스마트 센서 모듈 A', '재고'], ['SN-9931001', '스마트 센서 모듈 A', '출고됨']],
  },
  '/receiving-orders': {
    kind: 'table',
    topBar: { tabs: ['전체', '대기', '진행', '완료', '취소'], activeTab: 0, primaryLabel: '+ 새 입고지시서' },
    columns: ['입고번호', '거래처', '상태'],
    rows: [['RC-2026-054', '대양테크', '검수 중'], ['RC-2026-053', '해솔전자', '완료']],
  },
  '/attendance': { kind: 'stats', calendar: true, tiles: [
    { label: '오늘 근무', value: '3시간 42분' }, { label: '이번 주', value: '32시간' }, { label: '잔여 연차', value: '8.5일' },
  ] },
  '/attendance/leaves': {
    kind: 'table', columns: ['휴가 종류', '기간', '상태'],
    rows: [['연차', '2026-07-15 ~ 07-16', '승인 대기'], ['반차', '2026-07-03', '승인됨']],
  },
  '/attendance/team': {
    kind: 'table', columns: ['이름', '상태', '사유'],
    rows: [['김영업', '휴가', '연차'], ['박주임', '출근', '-']],
  },
  '/attendance/policy': { kind: 'stats', tiles: [
    { label: '연간 부여 연차', value: '15일' }, { label: '반차 단위', value: '4시간' }, { label: '공휴일', value: '17일 등록' },
  ] },
  '/expenses': {
    kind: 'table', topBar: { primaryLabel: '+ 새 경비' }, columns: ['항목', '금액', '상태'],
    rows: [['출장 교통비', '₩84,000', '승인 대기'], ['거래처 미팅 식대', '₩56,000', '지급 완료']],
  },
  '/expenses/finance': {
    kind: 'table', columns: ['청구자', '금액', '상태'],
    rows: [['김영업', '₩84,000', '지급 대기'], ['박주임', '₩56,000', '지급 완료']],
  },
  '/profit-loss': { kind: 'stats', tiles: [
    { label: '매출', value: '₩84,200,000' }, { label: '매출원가', value: '₩51,300,000' }, { label: '영업이익', value: '₩18,900,000' },
  ] },
};

function TableTopBar({ topBar }: { topBar: TopBar }) {
  return (
    <div className='mockup-in mb-2.5 flex flex-wrap items-center justify-between gap-2'>
      <div className='flex flex-wrap items-center gap-1.5'>
        {topBar.search && (
          <div className='flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] text-gray-400'>
            <Search className='h-3 w-3' />
            {topBar.search}
          </div>
        )}
        {topBar.tabs?.map((t, i) => (
          <span
            key={t}
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${
              i === (topBar.activeTab ?? 0) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {t}
          </span>
        ))}
      </div>
      {topBar.primaryLabel && (
        <span className='rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] font-semibold text-white'>{topBar.primaryLabel}</span>
      )}
    </div>
  );
}

function RecordThreadPreview({ thread, delay }: { thread: RecordThread; delay: number }) {
  return (
    <div className='mockup-in mt-2.5 rounded-lg border border-gray-200 bg-gray-50 p-2.5' style={{ animationDelay: `${delay}ms` }}>
      <p className='mb-1 text-[10px] font-semibold tracking-wide text-gray-400'>🧵 레코드 대화 · {thread.ref}</p>
      <p className='text-[11px] text-gray-700'>
        <span className='font-semibold text-gray-900'>{thread.author}</span> · {thread.text}
      </p>
    </div>
  );
}

function MockTable({ content }: { content: Extract<MockContent, { kind: 'table' }> }) {
  const { topBar, tiles, columns, rows, recordThread } = content;
  return (
    <div className='w-full'>
      {topBar && <TableTopBar topBar={topBar} />}
      {tiles && (
        <div className='mockup-in mb-2.5 grid grid-cols-3 gap-2'>
          {tiles.map((t) => (
            <div key={t.label} className='rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2'>
              <p className='text-[10px] text-gray-500'>{t.label}</p>
              <p className='text-[13px] font-bold text-gray-900'>{t.value}</p>
            </div>
          ))}
        </div>
      )}
      <div className='overflow-hidden rounded-lg border border-gray-200'>
        <div
          className='grid gap-2 border-b bg-gray-50 px-3 py-2 text-[11px] font-semibold tracking-wide text-gray-500'
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((c) => <span key={c} className='truncate'>{c}</span>)}
        </div>
        {rows.map((row, i) => (
          <div
            key={i}
            className='mockup-in grid gap-2 border-b px-3 py-2.5 text-[12px] text-gray-700 last:border-b-0'
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, animationDelay: `${i * 90}ms` }}
          >
            {row.map((cell, j) => (
              <span key={j} className='truncate'>
                <StatusBadge value={cell} />
              </span>
            ))}
          </div>
        ))}
      </div>
      {recordThread && <RecordThreadPreview thread={recordThread} delay={rows.length * 90 + 150} />}
    </div>
  );
}

function MockCalendar() {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const leading = 3; // 2026-07-01은 수요일 → 일/월/화 자리는 빈칸
  const cells: (number | null)[] = [...Array(leading).fill(null), ...days];
  return (
    <div className='mockup-in mt-3 rounded-lg border border-gray-200 p-3'>
      <p className='mb-2 text-[11px] font-semibold text-gray-600'>2026년 7월</p>
      <div className='grid grid-cols-7 gap-1 text-center text-[9px] text-gray-400'>
        {['일', '월', '화', '수', '목', '금', '토'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className='mt-1 grid grid-cols-7 gap-1'>
        {cells.map((d, i) => (
          <div
            key={i}
            className={`mockup-in flex h-6 items-center justify-center rounded text-[10px] ${
              d === 8 ? 'bg-gray-900 font-bold text-white' : d ? 'text-gray-600' : ''
            }`}
            style={{ animationDelay: `${i * 10}ms` }}
          >
            {d ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockStats({ content }: { content: Extract<MockContent, { kind: 'stats' }> }) {
  return (
    <div className='w-full'>
      <div className='grid grid-cols-3 gap-3'>
        {content.tiles.map((t, i) => (
          <div key={t.label} className='mockup-in rounded-lg border border-gray-200 bg-gray-50 p-3' style={{ animationDelay: `${i * 100}ms` }}>
            <p className='text-[11px] text-gray-500'>{t.label}</p>
            <p className='mt-1 truncate text-[15px] font-bold text-gray-900'>{t.value}</p>
          </div>
        ))}
      </div>
      {content.calendar && <MockCalendar />}
    </div>
  );
}

function MockKanban({ content }: { content: Extract<MockContent, { kind: 'kanban' }> }) {
  return (
    <div className='w-full'>
      <div className='mockup-in mb-3 flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-3 text-[11px] text-gray-500'>
          {content.header.map((h) => (
            <span key={h.label}>{h.label} <b className='text-gray-900'>{h.value}</b></span>
          ))}
        </div>
        {content.primaryLabel && (
          <span className='rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] font-semibold text-white'>{content.primaryLabel}</span>
        )}
      </div>
      <div className='flex gap-2 overflow-x-auto'>
        {content.columns.map((col, ci) => (
          <div key={col.name} className='mockup-in w-36 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-2' style={{ animationDelay: `${ci * 90}ms` }}>
            <div className='mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-gray-600'>
              <span className='h-1.5 w-1.5 shrink-0 rounded-full' style={{ background: col.color }} />
              <span className='truncate'>{col.name}</span>
              <span className='ml-auto shrink-0 text-gray-400'>{col.cards.length}</span>
            </div>
            <div className='space-y-1.5'>
              {col.cards.map((c, i) => (
                <div key={c.title} className='mockup-in rounded-md border border-gray-200 bg-white p-2 shadow-sm' style={{ animationDelay: `${ci * 90 + i * 80 + 150}ms` }}>
                  <p className='truncate text-[11px] font-semibold text-gray-900'>{c.title}</p>
                  <p className='truncate text-[10px] text-gray-500'>{c.sub}</p>
                  {c.value && <p className='mt-1 text-[11px] font-bold text-gray-700'>{c.value}</p>}
                </div>
              ))}
              {col.cards.length === 0 && <p className='py-2 text-center text-[10px] text-gray-400'>딜 없음</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockGroupList({ content }: { content: Extract<MockContent, { kind: 'groupList' }> }) {
  return (
    <div className='w-full space-y-3'>
      {content.groups.map((g, gi) => (
        <div key={g.label} className='mockup-in' style={{ animationDelay: `${gi * 110}ms` }}>
          <p className='mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-gray-700'>
            <span className='h-1.5 w-1.5 rounded-full' style={{ background: g.color }} />
            {g.label}
            <span className='rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-500'>{g.items.length}</span>
          </p>
          <div className='space-y-1.5'>
            {g.items.map((it) => (
              <div key={it.title} className='rounded-lg border-l-4 bg-white p-2.5 shadow-sm' style={{ borderColor: g.color }}>
                <div className='flex items-center justify-between gap-2'>
                  <p className='truncate text-[12px] font-bold text-gray-900'>{it.title}</p>
                  {it.badge && <StatusBadge value={it.badge} />}
                </div>
                <p className='mt-0.5 truncate text-[11px] text-gray-500'>{it.sub}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MockDashboard() {
  const cards = [
    { title: '수주현황', rows: [['대기', '3'], ['확정', '12'], ['출고·완료', '22']] },
    { title: '영업 파이프라인', rows: [['열린 딜', '2건'], ['예상 금액', '₩80,000,000']] },
    { title: 'A/S 현황', rows: [['접수', '1'], ['점검 중', '1'], ['수리 완료', '1']] },
  ];
  const bars = [40, 65, 50, 80, 60, 90, 70];
  return (
    <div className='w-full space-y-3'>
      <div className='grid grid-cols-3 gap-2'>
        {cards.map((card, i) => (
          <div key={card.title} className='mockup-in rounded-lg border border-gray-200 bg-gray-50 p-2.5' style={{ animationDelay: `${i * 90}ms` }}>
            <p className='mb-1.5 truncate text-[10px] font-semibold text-gray-600'>{card.title}</p>
            <div className='space-y-1'>
              {card.rows.map(([l, v]) => (
                <div key={l} className='flex items-center justify-between text-[11px]'>
                  <span className='truncate text-gray-500'>{l}</span>
                  <span className='shrink-0 font-bold text-gray-900'>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className='mockup-in rounded-lg border border-gray-200 bg-gray-50 p-3' style={{ animationDelay: '280ms' }}>
        <div className='mb-2 flex items-center justify-between'>
          <p className='text-[11px] font-semibold text-gray-600'>매출 추이</p>
          <p className='text-[13px] font-bold text-gray-900'>₩84,200,000</p>
        </div>
        <div className='flex h-16 items-end gap-1'>
          {bars.map((h, i) => (
            <div key={i} className='mockup-in flex-1 rounded-t bg-blue-200' style={{ height: `${h}%`, animationDelay: `${380 + i * 40}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// 실제 인박스 구조: 인사말 + 출근 카드 + 오늘의 업무 + 대화·멘션 피드(레코드 대화 포함)
function MockInbox() {
  return (
    <div className='w-full space-y-2.5'>
      <div className='mockup-in rounded-lg border border-gray-200 bg-gray-50 p-3'>
        <p className='text-[12px] font-bold text-gray-900'>☀️ 홍길동님, 좋은 오후예요</p>
        <span className='mt-1.5 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'>
          지금 처리할 결재가 없습니다
        </span>
      </div>
      <div className='mockup-in flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3' style={{ animationDelay: '90ms' }}>
        <div>
          <p className='text-[11px] text-gray-500'>오늘 7월 8일 (수)</p>
          <p className='text-[12px] font-semibold text-gray-900'>아직 출근 전입니다 · 이번 주 32시간</p>
        </div>
        <span className='shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white'>출근</span>
      </div>
      <div className='mockup-in' style={{ animationDelay: '180ms' }}>
        <div className='mb-1.5 flex gap-1.5'>
          {['전체', '@멘션', '레코드 대화'].map((t, i) => (
            <span key={t} className={`rounded-md px-2 py-1 text-[11px] font-medium ${i === 0 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {t}
            </span>
          ))}
        </div>
        <div className='space-y-1.5'>
          <div className='mockup-in rounded-lg border border-gray-200 bg-white p-2.5' style={{ animationDelay: '280ms' }}>
            <p className='text-[10px] text-gray-400'>박주임 · 방금 · 견적서 Q-2026-118</p>
            <p className='text-[12px] text-gray-800'><span className='font-semibold text-blue-600'>@홍길동</span> 이 견적서 금액 한번 확인해주실래요?</p>
          </div>
          <div className='mockup-in rounded-lg border border-gray-200 bg-white p-2.5' style={{ animationDelay: '370ms' }}>
            <p className='text-[10px] text-gray-400'>🧵 레코드 대화 · SO-2026-042</p>
            <p className='text-[12px] text-gray-800'>김대리: 재고 차감까지 완료했어요</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChatDemoProps {
  inputText: string;
  showAutocomplete: boolean;
  mentionChip: string | null;
  inputRef: React.RefObject<HTMLDivElement | null>;
  suggestionRef: React.RefObject<HTMLDivElement | null>;
}

// 실제 채팅 구조: 채널/DM 목록 사이드바 + 메시지 스레드 + 하단 입력창(가상 커서가 @멘션을 직접 입력)
function MockChatFull({ inputText, showAutocomplete, mentionChip, inputRef, suggestionRef }: ChatDemoProps) {
  return (
    <div className='flex w-full flex-1 gap-3'>
      <div className='mockup-in w-24 shrink-0 space-y-2.5 border-r border-gray-100 pr-2.5 text-[11px]'>
        <div>
          <p className='mb-1 flex items-center justify-between text-gray-400'>
            채널 <Plus className='h-2.5 w-2.5' />
          </p>
          <div className='space-y-0.5'>
            <p className='truncate rounded bg-gray-900 px-1.5 py-1 font-semibold text-white'># 영업지원</p>
            <p className='truncate rounded px-1.5 py-1 text-gray-500'># 파이프라인</p>
            <p className='truncate rounded px-1.5 py-1 text-gray-500'># 물류</p>
          </div>
        </div>
        <div>
          <p className='mb-1 flex items-center justify-between text-gray-400'>
            DM <Plus className='h-2.5 w-2.5' />
          </p>
          <div className='space-y-0.5'>
            <p className='truncate rounded px-1.5 py-1 text-gray-500'>박주임</p>
            <p className='truncate rounded px-1.5 py-1 text-gray-500'>김대리</p>
          </div>
        </div>
      </div>

      <div className='flex min-w-0 flex-1 flex-col justify-between'>
        <div className='space-y-3'>
          <div className='mockup-in flex gap-2' style={{ animationDelay: '80ms' }}>
            <div className='grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700'>박</div>
            <div className='rounded-xl rounded-tl-sm bg-gray-100 px-3 py-2 text-[12px] text-gray-700'>
              대양테크 건 오늘 출고 가능한가요?
            </div>
          </div>
          <div className='flex gap-2'>
            <div className='mockup-in grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700' style={{ animationDelay: '650ms' }}>김</div>
            <div className='relative min-w-0'>
              <div aria-hidden className='typing-fade absolute top-0 left-0 flex items-center gap-1 rounded-xl rounded-tl-sm bg-gray-100 px-3 py-2.5' style={{ animationDelay: '350ms' }}>
                <span className='typing-dot h-1.5 w-1.5 rounded-full bg-gray-400' style={{ animationDelay: '0ms' }} />
                <span className='typing-dot h-1.5 w-1.5 rounded-full bg-gray-400' style={{ animationDelay: '150ms' }} />
                <span className='typing-dot h-1.5 w-1.5 rounded-full bg-gray-400' style={{ animationDelay: '300ms' }} />
              </div>
              <div className='mockup-in rounded-xl rounded-tl-sm bg-gray-100 px-3 py-2 text-[12px] text-gray-700' style={{ animationDelay: '650ms' }}>
                네, 방금{' '}
                <span className='inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700'>
                  수주 SO-2026-042
                </span>{' '}
                확정했어요
              </div>
            </div>
          </div>
        </div>

        {/* 실제 메시지 입력창 — 가상 커서가 여기에 @멘션을 직접 타이핑 */}
        <div className='relative mt-3'>
          {showAutocomplete && (
            <div ref={suggestionRef} className='absolute bottom-full left-0 mb-1.5 w-48 rounded-lg border border-gray-200 bg-white p-1 shadow-lg'>
              {MENTION_SUGGESTIONS.map((s) => (
                <div key={s.label} className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] ${s.label === '대양테크' ? 'bg-blue-50' : ''}`}>
                  <s.icon className='h-3 w-3 text-gray-400' />
                  <span className='font-medium text-gray-800'>{s.label}</span>
                  <span className='ml-auto text-[9px] text-gray-400'>{s.type}</span>
                </div>
              ))}
            </div>
          )}
          <div ref={inputRef} className='flex min-h-[34px] items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-800'>
            {mentionChip && (
              <span className='mr-1 shrink-0 rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700'>@{mentionChip}</span>
            )}
            <span>{inputText}</span>
            <span className='ml-0.5 inline-block h-3.5 w-[1.5px] animate-pulse bg-gray-400' />
          </div>
        </div>
      </div>
    </div>
  );
}

// 실제 Sidebar와 같은 데이터(allNavGroups + 모듈 매핑)로 만든 미리보기.
// 왼쪽에서 모듈을 켜고 끄면 위쪽 탭이 실시간으로 생기고 사라진다 — 탭을 누르면 그 화면의 실제 구조를 닮은 라이브 목업이 등장.
export default function ModulePreview({ enabledModules }: Props) {
  const groups = useMemo(
    () =>
      allNavGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => isMenuModuleEnabled(item.href, enabledModules)),
        }))
        .filter((group) => group.items.length > 0),
    [enabledModules],
  );

  // 채팅은 핵심 기능이라 인박스 바로 다음(두 번째)에 오도록 앞당김 — 나머지 순서는 그대로
  const flatItems = useMemo(() => {
    const items = groups.flatMap((g) => g.items);
    const chatIndex = items.findIndex((i) => i.href === '/chat');
    if (chatIndex > 1) {
      const [chatItem] = items.splice(chatIndex, 1);
      items.splice(1, 0, chatItem);
    }
    return items;
  }, [groups]);
  // 클릭으로 고른 항목이 모듈을 꺼서 사라지면 자동으로 첫 항목으로 폴백 (effect 없이 렌더 중 계산)
  const [manualHref, setManualHref] = useState<string | null>(null);
  const active = flatItems.find((item) => item.href === manualHref) ?? flatItems[0];
  const content = active && !active.external ? PREVIEW_CONTENT[active.href] : undefined;

  // 가상 커서 데모 — 채팅 탭 클릭 → @멘션 입력 → 멘션 확정 → 미니채팅 공유까지 자동 재생
  const panelRef = useRef<HTMLDivElement>(null);
  const chatTabRef = useRef<HTMLButtonElement>(null);
  const chatInputRef = useRef<HTMLDivElement>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);
  const miniChatBtnRef = useRef<HTMLButtonElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [cursor, setCursor] = useState({ x: 40, y: 40, visible: false, clicking: false });
  const [demoInputText, setDemoInputText] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [mentionChip, setMentionChip] = useState<string | null>(null);
  const [miniChatOpen, setMiniChatOpen] = useState(false);

  function moveCursorTo(ref: React.RefObject<HTMLElement | null>, click = false) {
    const panel = panelRef.current;
    const el = ref.current;
    if (!panel || !el) return;
    const p = panel.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    setCursor({ x: e.left - p.left + e.width / 2 - 10, y: e.top - p.top + e.height / 2 - 8, visible: true, clicking: click });
  }

  function cancelSequence() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function scheduleSequence(startDelay: number) {
    const at = (ms: number, fn: () => void) => { timersRef.current.push(setTimeout(fn, startDelay + ms)); };

    at(1200, () => moveCursorTo(chatTabRef));
    at(1750, () => { setCursor((c) => ({ ...c, clicking: true })); setManualHref('/chat'); });
    at(2000, () => setCursor((c) => ({ ...c, clicking: false })));
    at(2900, () => moveCursorTo(chatInputRef));
    at(3300, () => setDemoInputText('@'));
    at(3480, () => setDemoInputText('@대'));
    at(3680, () => { setDemoInputText('@대양'); setShowAutocomplete(true); });
    at(4450, () => moveCursorTo(suggestionRef));
    at(4900, () => {
      setCursor((c) => ({ ...c, clicking: true }));
      setShowAutocomplete(false);
      setMentionChip('대양테크');
      setDemoInputText(' 건 재고 좀 확인해주세요');
    });
    at(5150, () => setCursor((c) => ({ ...c, clicking: false })));
    at(6100, () => moveCursorTo(miniChatBtnRef));
    at(6550, () => { setCursor((c) => ({ ...c, clicking: true })); setMiniChatOpen(true); });
    at(6800, () => setCursor((c) => ({ ...c, clicking: false, visible: false })));
  }

  // 사용자가 아무 탭이나 누르면 진행 중이던 데모를 멈추고, 잠시 후 처음부터 다시 재생
  function replaySequence() {
    cancelSequence();
    setCursor((c) => ({ ...c, visible: false, clicking: false }));
    setDemoInputText('');
    setShowAutocomplete(false);
    setMentionChip(null);
    setMiniChatOpen(false);
    scheduleSequence(1400);
  }

  useEffect(() => {
    scheduleSequence(0);
    return () => cancelSequence();
    // 마운트 시 1회만 재생 — scheduleSequence는 매 렌더 재생성되지만 안정된 ref/setter만 참조하므로 의도적으로 deps 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={panelRef} className='sticky top-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md'>
      {/* 타이틀바 */}
      <div className='relative flex items-center gap-2 border-b bg-gray-50 px-4 py-2.5'>
        <span className='h-2.5 w-2.5 rounded-full bg-[#ff5f57]' />
        <span className='h-2.5 w-2.5 rounded-full bg-[#febc2e]' />
        <span className='h-2.5 w-2.5 rounded-full bg-[#28c840]' />
        <span className='ml-2 flex-1 truncate rounded-md bg-gray-100 px-3 py-1 text-center text-[11px] text-gray-500'>
          app.flexible.io{active && !active.external ? active.href : ''}
        </span>
        {/* 장식용 반짝이 */}
        <span aria-hidden className='sparkle pointer-events-none absolute top-1 right-10 h-1 w-1 rounded-full bg-blue-400' style={{ animationDelay: '0ms' }} />
        <span aria-hidden className='sparkle pointer-events-none absolute bottom-1 left-24 h-1 w-1 rounded-full bg-violet-400' style={{ animationDelay: '900ms' }} />
      </div>

      {/* 켜진 모듈의 메뉴만 탭으로 노출 — 가로 스크롤 */}
      <div className='flex gap-1.5 overflow-x-auto border-b bg-gray-50/60 px-3 py-2'>
        {flatItems.length === 0 && (
          <p className='px-1 py-1 text-xs text-gray-400'>켜진 모듈이 없어요</p>
        )}
        {flatItems.map((item) => (
          <button
            key={item.href}
            type='button'
            ref={item.href === '/chat' ? chatTabRef : undefined}
            onClick={() => { replaySequence(); setManualHref(item.href); }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] whitespace-nowrap transition ${
              active?.href === item.href
                ? 'bg-gray-900 font-semibold text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <item.icon size={13} />
            {item.label}
          </button>
        ))}
      </div>

      {/* 라이브 목업 — 탭 바꿀 때마다 key로 리마운트시켜 애니메이션 재생 */}
      <div className='flex min-h-[600px] flex-col p-5'>
        {!active ? (
          <div className='flex flex-1 items-center justify-center'>
            <p className='text-xs text-gray-400'>왼쪽에서 모듈을 골라보세요</p>
          </div>
        ) : (
          <div key={active.href} className='flex flex-1 flex-col'>
            <div className='mockup-in mb-4 flex items-center gap-2'>
              <span className='grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600'>
                <active.icon size={16} />
              </span>
              <p className='text-[15px] font-bold text-gray-900'>{active.label}</p>
            </div>

            {active.external ? (
              <p className='mockup-in max-w-[280px] text-xs leading-relaxed text-gray-500'>
                물류팀 전용 화면 — 새 탭에서 별도 앱으로 열립니다.
              </p>
            ) : content?.kind === 'table' ? (
              <MockTable content={content} />
            ) : content?.kind === 'stats' ? (
              <MockStats content={content} />
            ) : content?.kind === 'kanban' ? (
              <MockKanban content={content} />
            ) : content?.kind === 'groupList' ? (
              <MockGroupList content={content} />
            ) : content?.kind === 'dashboard' ? (
              <MockDashboard />
            ) : content?.kind === 'inbox' ? (
              <MockInbox />
            ) : content?.kind === 'chat' ? (
              <MockChatFull
                inputText={demoInputText}
                showAutocomplete={showAutocomplete}
                mentionChip={mentionChip}
                inputRef={chatInputRef}
                suggestionRef={suggestionRef}
              />
            ) : (
              <p className='mockup-in text-xs text-gray-400'>항상 켜져 있는 핵심 화면입니다.</p>
            )}
          </div>
        )}
      </div>

      {/* 플로팅 미니채팅 — 어느 화면에서든 레코드를 채팅으로 공유할 수 있다는 걸 보여줌 */}
      <button
        ref={miniChatBtnRef}
        type='button'
        onClick={() => setMiniChatOpen((v) => !v)}
        className='absolute right-4 bottom-4 z-40 grid h-10 w-10 place-items-center rounded-full bg-gray-900 text-white shadow-lg transition hover:scale-105'
      >
        <MessageCircle className='h-5 w-5' />
      </button>
      {miniChatOpen && (
        <div className='mockup-in absolute right-4 bottom-16 z-40 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-xl'>
          <div className='mb-2 flex items-center justify-between'>
            <p className='text-[11px] font-semibold text-gray-700'>미니채팅 · 공유됨</p>
            <button type='button' onClick={() => setMiniChatOpen(false)} className='text-gray-400 hover:text-gray-600'>
              <X className='h-3.5 w-3.5' />
            </button>
          </div>
          <div className='rounded-lg bg-gray-50 p-2'>
            <p className='text-[11px] text-gray-700'>
              {mentionChip && <span className='mr-1 rounded bg-blue-50 px-1 font-semibold text-blue-700'>@{mentionChip}</span>}
              건 재고 좀 확인해주세요
            </p>
          </div>
          <p className='mt-1.5 text-[10px] text-gray-400'>어느 화면에서든 이 버튼으로 레코드를 채팅에 바로 공유해요</p>
        </div>
      )}

      <FakeCursor x={cursor.x} y={cursor.y} clicking={cursor.clicking} visible={cursor.visible} />
    </div>
  );
}
