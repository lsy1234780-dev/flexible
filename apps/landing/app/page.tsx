import {
  ArrowRight,
  AtSign,
  Blocks,
  Building2,
  CalendarClock,
  Check,
  FileCheck,
  Inbox,
  KeyRound,
  MessageSquare,
  Package,
  Receipt,
  ShieldCheck,
  ClipboardList,
  Server,
} from 'lucide-react';

const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

// 모듈 스트립 — 실제 workspace_modules 키와 대응되는 대표 모듈들
const MODULES: { name: string; on: boolean }[] = [
  { name: '재고', on: true },
  { name: '입출고', on: true },
  { name: '견적', on: true },
  { name: '수주', on: true },
  { name: '구매발주', on: true },
  { name: '팀 채팅', on: true },
  { name: '근태', on: true },
  { name: '경비', on: true },
  { name: 'B2B 포털', on: true },
  { name: 'CRM 파이프라인', on: false },
  { name: '이커머스', on: false },
  { name: 'POS', on: false },
];

const FEATURES = [
  {
    icon: Blocks,
    title: '필요한 모듈만 조립',
    desc: '재고·견적·근태·채팅이 전부 대등한 "모듈". 설정에서 스위치 하나로 켜고 끄면, 메뉴와 화면이 그대로 따라옵니다.',
  },
  {
    icon: AtSign,
    title: '엔티티 멘션 채팅',
    desc: '채팅에서 수주·거래처·제품을 @로 태그하면 칩으로 박히고, 클릭하면 그 레코드로 바로 점프. 대화와 데이터가 끊기지 않습니다.',
  },
  {
    icon: Package,
    title: '재고·주문 코어',
    desc: '바코드 입출고, 시리얼·LOT 추적, 주문 확정 시 원자적 재고 차감까지. 엑셀로 버티던 물류가 시스템이 됩니다.',
  },
  {
    icon: FileCheck,
    title: '승인 워크플로우',
    desc: '수주 확정, 구매발주, 휴가, 경비 청구 — 결재가 필요한 모든 곳에 같은 승인 흐름이 흐릅니다.',
  },
  {
    icon: CalendarClock,
    title: '근태와 경비까지',
    desc: '출퇴근 기록, 휴가 신청·잔여 관리, 경비 청구와 정산. 인사팀이 따로 없는 회사를 위해 설계했습니다.',
  },
  {
    icon: ShieldCheck,
    title: '권한과 격리',
    desc: '부서·직급 기반 메뉴 권한에, 데이터베이스 단(RLS)의 워크스페이스 격리. 회사 데이터는 회사 안에만.',
  },
];

export default function LandingPage() {
  return (
    <main className='relative overflow-x-clip'>
      {/* ───────── 네비게이션 ───────── */}
      <header className='fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#0b0f1c]/80 backdrop-blur-md'>
        <nav className='mx-auto flex h-16 max-w-6xl items-center justify-between px-5'>
          <a href='#' className='flex items-center gap-2 text-lg font-bold text-white'>
            <span className='grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-soft)] to-[var(--violet)]'>
              <Blocks className='h-4 w-4 text-white' />
            </span>
            Flexible
          </a>
          <div className='hidden items-center gap-7 text-sm text-slate-400 md:flex'>
            <a href='#features' className='transition hover:text-white'>기능</a>
            <a href='#get-started' className='transition hover:text-white'>시작 방법</a>
            <a href='#dedicated' className='transition hover:text-white'>구축형 도입</a>
          </div>
          <div className='flex items-center gap-2'>
            <a
              href={`${APP}/login`}
              className='rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white'
            >
              로그인
            </a>
            <a
              href={`${APP}/signup`}
              className='rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[var(--brand)]/25 transition hover:brightness-110'
            >
              무료로 시작
            </a>
          </div>
        </nav>
      </header>

      {/* ───────── 히어로 ───────── */}
      <section className='bg-grid relative pt-36 pb-20 md:pt-44'>
        {/* 배경 글로우 */}
        <div aria-hidden className='pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-[var(--brand)]/20 blur-3xl' />
        <div aria-hidden className='pointer-events-none absolute top-40 right-[-120px] h-[300px] w-[300px] rounded-full bg-[var(--violet)]/15 blur-3xl' />

        <div className='relative mx-auto max-w-6xl px-5 text-center'>
          <p className='rise rise-1 mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-300'>
            <span className='inline-block h-1.5 w-1.5 rounded-full bg-emerald-400' />
            모듈형 비즈니스 워크스페이스 · 베타
          </p>

          <h1 className='rise rise-2 mx-auto mt-6 max-w-3xl text-4xl leading-[1.15] font-black tracking-tight text-white md:text-6xl'>
            필요한 기능만 조립하는
            <br />
            <span className='text-gradient'>우리 회사 워크스페이스</span>
          </h1>

          <p className='rise rise-3 mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-400 md:text-lg'>
            재고·발주·견적부터 근태·경비·팀 채팅까지.
            쓰지도 않을 기능을 사는 대신, 필요한 모듈만 골라 켜세요.
            회사가 크면 모듈을 더하면 됩니다.
          </p>

          <div className='rise rise-3 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row'>
            <a
              href={`${APP}/signup`}
              className='group inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-7 text-[15px] font-bold text-white shadow-xl shadow-[var(--brand)]/30 transition hover:brightness-110 sm:w-auto'
            >
              무료로 시작하기
              <ArrowRight className='h-4 w-4 transition group-hover:translate-x-0.5' />
            </a>
            <a
              href={`${APP}/join`}
              className='inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 text-[15px] font-semibold text-slate-200 transition hover:bg-white/10 sm:w-auto'
            >
              <KeyRound className='h-4 w-4 text-slate-400' />
              초대코드로 팀 합류
            </a>
          </div>
          <p className='rise rise-3 mt-4 text-xs text-slate-500'>
            설치 없음 · 카드 등록 없음 · 베타 기간 전 모듈 무료
          </p>

          {/* ── 제품 목업 ── */}
          <div className='rise rise-4 relative mx-auto mt-16 max-w-4xl'>
            <div aria-hidden className='absolute -inset-x-8 -top-8 h-40 rounded-full bg-[var(--brand)]/20 blur-3xl' />
            <div className='relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e1526] text-left shadow-2xl shadow-black/50'>
              {/* 타이틀바 */}
              <div className='flex items-center gap-2 border-b border-white/5 bg-white/[0.03] px-4 py-3'>
                <span className='h-2.5 w-2.5 rounded-full bg-[#ff5f57]' />
                <span className='h-2.5 w-2.5 rounded-full bg-[#febc2e]' />
                <span className='h-2.5 w-2.5 rounded-full bg-[#28c840]' />
                <span className='ml-3 flex-1 truncate rounded-md bg-black/30 px-3 py-1 text-center text-[11px] text-slate-500'>
                  app.flexible.io/chat
                </span>
              </div>
              <div className='flex'>
                {/* 사이드바 */}
                <div className='hidden w-44 shrink-0 border-r border-white/5 bg-black/20 p-3 sm:block'>
                  <p className='px-2 pb-2 text-[10px] font-semibold tracking-widest text-slate-600'>WORKSPACE</p>
                  {[
                    { icon: Inbox, label: '인박스' },
                    { icon: MessageSquare, label: '팀 채팅', active: true },
                    { icon: Package, label: '재고' },
                    { icon: ClipboardList, label: '수주' },
                    { icon: Receipt, label: '경비' },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] ${
                        m.active ? 'bg-[var(--brand)]/20 font-semibold text-white' : 'text-slate-400'
                      }`}
                    >
                      <m.icon className='h-3.5 w-3.5' />
                      {m.label}
                    </div>
                  ))}
                  <p className='px-2 pt-3 pb-1 text-[10px] text-slate-600'>+ 모듈 추가로 확장</p>
                </div>
                {/* 채팅 영역 */}
                <div className='min-w-0 flex-1 p-4 sm:p-5'>
                  <div className='space-y-4'>
                    <div className='flex gap-2.5'>
                      <div className='grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-500/30 text-[11px] font-bold text-violet-200'>박</div>
                      <div>
                        <p className='text-[11px] text-slate-500'>박주임 · 오전 10:24</p>
                        <div className='mt-1 rounded-xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-[13px] text-slate-200'>
                          대양테크 건 오늘 출고 가능한가요? 재고 확인 부탁드려요
                        </div>
                      </div>
                    </div>
                    <div className='flex gap-2.5'>
                      <div className='grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-500/30 text-[11px] font-bold text-sky-200'>김</div>
                      <div className='min-w-0'>
                        <p className='text-[11px] text-slate-500'>김대리 · 오전 10:26</p>
                        <div className='mt-1 rounded-xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-[13px] text-slate-200'>
                          네, 가능합니다.{' '}
                          <span className='inline-flex items-center gap-1 rounded-md border border-[var(--brand)]/40 bg-[var(--brand)]/15 px-1.5 py-0.5 align-middle text-[12px] font-semibold text-[#9db1ff]'>
                            <ClipboardList className='h-3 w-3' />
                            수주 SO-2026-042
                          </span>{' '}
                          방금 확정했고 재고 차감까지 완료됐어요
                        </div>
                        {/* 엔티티 미리보기 카드 */}
                        <div className='mt-2 max-w-sm rounded-xl border border-white/10 bg-black/30 p-3.5'>
                          <div className='flex items-center justify-between gap-2'>
                            <p className='text-[13px] font-bold text-white'>SO-2026-042 · 대양테크</p>
                            <span className='rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300'>출고 대기</span>
                          </div>
                          <p className='mt-1.5 text-[12px] text-slate-400'>스마트 센서 모듈 외 2건 · ₩4,180,000</p>
                          <div className='mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500'>
                            <Check className='h-3 w-3 text-emerald-400' /> 재고 차감 완료
                            <span className='mx-1 text-slate-700'>·</span>
                            클릭하면 수주 상세로 이동
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── 모듈 스트립 ───────── */}
      <section className='relative border-y border-white/5 bg-white/[0.02] py-16'>
        <div className='mx-auto max-w-6xl px-5 text-center'>
          <h2 className='text-xl font-bold text-white md:text-2xl'>
            전부 사면 무겁고, 따로 쓰면 흩어집니다
          </h2>
          <p className='mx-auto mt-3 max-w-lg text-sm text-slate-400'>
            Flexible은 하나의 워크스페이스 안에서 모듈을 켜고 끕니다.
            스위치 하나면 메뉴가 생기고, 끄면 사라집니다.
          </p>
          <div className='mt-8 flex flex-wrap items-center justify-center gap-2.5'>
            {MODULES.map((m) => (
              <span
                key={m.name}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${
                  m.on
                    ? 'border-[var(--brand)]/40 bg-[var(--brand)]/10 font-semibold text-[#aabbff]'
                    : 'border-white/10 bg-transparent text-slate-600'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${m.on ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                {m.name}
              </span>
            ))}
          </div>
          <p className='mt-5 text-xs text-slate-600'>· 켜짐 상태는 예시입니다 — 회사마다 조합이 다릅니다 ·</p>
        </div>
      </section>

      {/* ───────── 기능 그리드 ───────── */}
      <section id='features' className='relative scroll-mt-20 py-24'>
        <div className='mx-auto max-w-6xl px-5'>
          <div className='text-center'>
            <p className='text-sm font-bold tracking-widest text-[var(--brand-soft)]'>FEATURES</p>
            <h2 className='mt-3 text-3xl font-black text-white md:text-4xl'>일이 흐르는 데 필요한 전부</h2>
            <p className='mx-auto mt-4 max-w-md text-sm text-slate-400'>
              업무 데이터와 팀의 대화가 한곳에서 연결되도록 설계했습니다.
            </p>
          </div>
          <div className='mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className='group rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition hover:border-[var(--brand)]/30 hover:bg-white/[0.05]'
              >
                <div className='grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--brand)]/25 to-[var(--violet)]/25 text-[var(--brand-soft)] transition group-hover:scale-105'>
                  <f.icon className='h-5 w-5' />
                </div>
                <h3 className='mt-4 text-[17px] font-bold text-white'>{f.title}</h3>
                <p className='mt-2 text-sm leading-relaxed text-slate-400'>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── 시작 방법 (두 갈래) ───────── */}
      <section id='get-started' className='relative scroll-mt-20 border-t border-white/5 bg-white/[0.02] py-24'>
        <div className='mx-auto max-w-6xl px-5'>
          <div className='text-center'>
            <p className='text-sm font-bold tracking-widest text-[var(--brand-soft)]'>GET STARTED</p>
            <h2 className='mt-3 text-3xl font-black text-white md:text-4xl'>어느 쪽이신가요?</h2>
          </div>

          <div className='mt-14 grid gap-6 md:grid-cols-2'>
            {/* 도입 담당자 */}
            <div className='relative flex flex-col overflow-hidden rounded-3xl border border-[var(--brand)]/30 bg-gradient-to-b from-[var(--brand)]/12 to-transparent p-8'>
              <div aria-hidden className='pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-[var(--brand)]/20 blur-3xl' />
              <div className='flex items-center gap-3'>
                <span className='grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand)]/25 text-[var(--brand-soft)]'>
                  <Building2 className='h-5 w-5' />
                </span>
                <div>
                  <p className='text-lg font-bold text-white'>처음 도입하는 회사</p>
                  <p className='text-xs text-slate-400'>대표 · 운영 담당자</p>
                </div>
              </div>
              <ol className='mt-6 space-y-3 text-sm text-slate-300'>
                {['Google 계정으로 가입', '회사 워크스페이스 만들기', '필요한 모듈을 구성하고 직원 초대'].map((s, i) => (
                  <li key={s} className='flex items-start gap-3'>
                    <span className='mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--brand)]/25 text-[11px] font-bold text-[var(--brand-soft)]'>
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
              <a
                href={`${APP}/signup`}
                className='group mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-6 text-[15px] font-bold text-white shadow-lg shadow-[var(--brand)]/25 transition hover:brightness-110'
              >
                무료로 워크스페이스 만들기
                <ArrowRight className='h-4 w-4 transition group-hover:translate-x-0.5' />
              </a>
            </div>

            {/* 직원 합류 */}
            <div className='flex flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-8'>
              <div className='flex items-center gap-3'>
                <span className='grid h-11 w-11 place-items-center rounded-xl bg-white/8 text-slate-300'>
                  <KeyRound className='h-5 w-5' />
                </span>
                <div>
                  <p className='text-lg font-bold text-white'>이미 도입한 회사의 직원</p>
                  <p className='text-xs text-slate-400'>관리자에게 초대코드를 받았다면</p>
                </div>
              </div>
              <ol className='mt-6 space-y-3 text-sm text-slate-300'>
                {['Google 계정으로 로그인', '받은 초대코드 입력 (FLX-XXXXXX)', '우리 회사 워크스페이스로 바로 합류'].map((s, i) => (
                  <li key={s} className='flex items-start gap-3'>
                    <span className='mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-slate-300'>
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
              <a
                href={`${APP}/join`}
                className='mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 text-[15px] font-semibold text-slate-200 transition hover:bg-white/10'
              >
                초대코드 입력하기
              </a>
              <p className='mt-3 text-center text-xs text-slate-500'>
                초대코드는 회사 관리자가 설정 → 직원 초대코드에서 발급합니다
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── 구축형 ───────── */}
      <section id='dedicated' className='relative scroll-mt-20 py-24'>
        <div className='mx-auto max-w-6xl px-5'>
          <div className='flex flex-col items-center gap-8 rounded-3xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent p-8 md:flex-row md:p-12'>
            <span className='grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--violet)]/20 text-[var(--violet)]'>
              <Server className='h-7 w-7' />
            </span>
            <div className='flex-1 text-center md:text-left'>
              <h2 className='text-2xl font-black text-white'>우리 회사만의 전용 환경이 필요하다면</h2>
              <p className='mt-2 max-w-xl text-sm leading-relaxed text-slate-400'>
                전용 데이터베이스와 전용 도메인으로 분리 운영되는 <b className='text-slate-200'>구축형 도입</b>도 지원합니다.
                기능은 동일하게, 데이터는 완전히 독립적으로.
              </p>
            </div>
            <a
              href='mailto:lsy1234780@gmail.com?subject=Flexible%20구축형%20도입%20문의'
              className='inline-flex h-12 shrink-0 items-center justify-center rounded-xl border border-[var(--violet)]/40 bg-[var(--violet)]/15 px-6 text-[15px] font-semibold text-violet-200 transition hover:bg-[var(--violet)]/25'
            >
              구축형 도입 문의
            </a>
          </div>
        </div>
      </section>

      {/* ───────── 마지막 CTA ───────── */}
      <section className='relative overflow-hidden border-t border-white/5 py-24 text-center'>
        <div aria-hidden className='pointer-events-none absolute bottom-0 left-1/2 h-72 w-[560px] -translate-x-1/2 rounded-full bg-[var(--brand)]/15 blur-3xl' />
        <div className='relative mx-auto max-w-2xl px-5'>
          <h2 className='text-3xl font-black text-white md:text-4xl'>
            오늘 켜는 모듈이
            <br />
            <span className='text-gradient'>내일의 업무 방식이 됩니다</span>
          </h2>
          <p className='mt-4 text-sm text-slate-400'>5분이면 우리 회사 워크스페이스가 만들어집니다.</p>
          <a
            href={`${APP}/signup`}
            className='group mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-8 py-3.5 text-base font-bold text-white shadow-xl shadow-[var(--brand)]/30 transition hover:brightness-110'
          >
            무료로 시작하기
            <ArrowRight className='h-4 w-4 transition group-hover:translate-x-0.5' />
          </a>
        </div>
      </section>

      {/* ───────── 푸터 ───────── */}
      <footer className='border-t border-white/5 py-10'>
        <div className='mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-slate-500 md:flex-row'>
          <p className='flex items-center gap-2'>
            <span className='grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-[var(--brand-soft)] to-[var(--violet)]'>
              <Blocks className='h-3 w-3 text-white' />
            </span>
            © 2026 Flexible
          </p>
          <div className='flex items-center gap-6'>
            <a href='#features' className='transition hover:text-slate-300'>기능</a>
            <a href='#get-started' className='transition hover:text-slate-300'>시작 방법</a>
            <a href={`${APP}/login`} className='transition hover:text-slate-300'>로그인</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
