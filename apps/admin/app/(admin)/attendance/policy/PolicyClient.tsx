'use client';

// 근태 설정 (근태 관리자 전용) — 정책·공휴일·휴가 종류·연차 부여·관리자 지정.
// 철칙: 법적 의미가 있는 값(연차 부여일수·주간 상한)은 전부 여기서 "사람이" 입력한다.
//       시스템은 그 값대로 기록·산수만 하고, 법 해석·판정은 하지 않는다 (면책 문구 고정 노출).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Info, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  updateAttendancePolicy, addHoliday, deleteHoliday,
  grantAttendanceManager, revokeAttendanceManager,
  type AttendancePolicy, type AttendanceManager,
} from '@/actions/attendance';
import {
  createLeaveType, deleteLeaveType, setLeaveGranted,
  type LeaveType, type TeamBalanceRow,
} from '@/actions/leaves';
import type { WorkspaceMember } from '@/actions/chat';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
type Tab = 'policy' | 'holidays' | 'types' | 'balances' | 'managers';

const TABS: { key: Tab; label: string }[] = [
  { key: 'policy', label: '근무 정책' },
  { key: 'holidays', label: '공휴일' },
  { key: 'types', label: '휴가 종류' },
  { key: 'balances', label: '연차 부여' },
  { key: 'managers', label: '관리자' },
];

interface Props {
  policy: AttendancePolicy;
  holidays: { id: string; holiday_date: string; name: string }[];
  types: LeaveType[];
  balances: TeamBalanceRow[];
  managers: AttendanceManager[];
  members: WorkspaceMember[];
  year: number;
}

export default function PolicyClient({ policy, holidays, types, balances, managers, members, year }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>('policy');

  // 정책 폼
  const [start, setStart] = useState(policy.standard_start.slice(0, 5));
  const [end, setEnd] = useState(policy.standard_end.slice(0, 5));
  const [breakMin, setBreakMin] = useState(String(policy.break_minutes));
  const [workDays, setWorkDays] = useState<number[]>(policy.work_days);
  const [weeklyMaxH, setWeeklyMaxH] = useState(
    policy.weekly_max_minutes != null ? String(policy.weekly_max_minutes / 60) : '',
  );

  // 공휴일 폼
  const [holDate, setHolDate] = useState('');
  const [holName, setHolName] = useState('');

  // 휴가 종류 폼
  const [typeName, setTypeName] = useState('');
  const [typeDeducts, setTypeDeducts] = useState(true);
  const [typeWeight, setTypeWeight] = useState('1');

  // 연차 부여 편집 상태 (행별 입력값)
  const [grantEdit, setGrantEdit] = useState<Record<string, string>>({});

  // 관리자 추가
  const [newManagerId, setNewManagerId] = useState('');

  function savePolicy() {
    const weeklyMax = weeklyMaxH.trim() === '' ? null : Math.round(parseFloat(weeklyMaxH) * 60);
    if (workDays.length === 0) { toast.error('근무 요일을 1개 이상 선택하세요'); return; }
    startTransition(async () => {
      const res = await updateAttendancePolicy({
        standard_start: start,
        standard_end: end,
        break_minutes: parseInt(breakMin, 10) || 0,
        work_days: workDays,
        weekly_max_minutes: weeklyMax,
      });
      if (res?.error) { toast.error(res.error); return; }
      toast.success('정책을 저장했습니다');
      router.refresh();
    });
  }

  function submitHoliday() {
    if (!holDate || !holName.trim()) { toast.error('날짜와 이름을 입력하세요'); return; }
    startTransition(async () => {
      const res = await addHoliday(holDate, holName);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('공휴일을 추가했습니다');
      setHolDate(''); setHolName('');
      router.refresh();
    });
  }

  function submitType() {
    if (!typeName.trim()) { toast.error('이름을 입력하세요'); return; }
    startTransition(async () => {
      const res = await createLeaveType(typeName, typeDeducts, parseFloat(typeWeight) || 1);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('휴가 종류를 추가했습니다');
      setTypeName(''); setTypeDeducts(true); setTypeWeight('1');
      router.refresh();
    });
  }

  function saveGranted(row: TeamBalanceRow) {
    const val = grantEdit[row.user_id];
    if (val == null || val === '') return;
    startTransition(async () => {
      const res = await setLeaveGranted(row.user_id, year, parseFloat(val), '');
      if (res?.error) { toast.error(res.error); return; }
      toast.success(`${row.name} 부여량을 저장했습니다`);
      router.refresh();
    });
  }

  function addManager() {
    if (!newManagerId) { toast.error('멤버를 선택하세요'); return; }
    startTransition(async () => {
      const res = await grantAttendanceManager(newManagerId);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('관리자 권한을 부여했습니다');
      setNewManagerId('');
      router.refresh();
    });
  }

  function removeManager(m: AttendanceManager) {
    if (!confirm(`${m.name} 님의 근태 관리자 권한을 회수하시겠습니까?`)) return;
    startTransition(async () => {
      const res = await revokeAttendanceManager(m.user_id);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('권한을 회수했습니다');
      router.refresh();
    });
  }

  const nonManagerMembers = members.filter((m) => !managers.some((g) => g.user_id === m.user_id));

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">근태 설정</h1>
        <p className="text-sm text-gray-500 mt-0.5">근무 정책과 휴가 기준을 관리합니다</p>
      </div>

      {/* 면책 문구 — 항상 노출 */}
      <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        <p>
          이 시스템은 출퇴근 시각의 <b>기록</b>과 입력값 기반 <b>산수</b>만 제공합니다.
          연차 부여일수·주간 근로시간 기준 등 법적 판단이 필요한 값은 회사가 노무 전문가와 확인하여 직접 입력하세요.
          시스템은 법정 기준을 산정하거나 위반 여부를 판정하지 않습니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 근무 정책 ── */}
      {tab === 'policy' && (
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>기준 출근</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>기준 퇴근</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>휴게 시간 (분)</Label>
              <Input type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} />
              <p className="text-[11px] text-gray-400">퇴근 시 근무시간에서 자동 차감됩니다</p>
            </div>
            <div className="space-y-1.5">
              <Label>주간 알림 임계 (시간, 선택)</Label>
              <Input
                type="number" min={0} step={0.5} value={weeklyMaxH}
                onChange={(e) => setWeeklyMaxH(e.target.value)}
                placeholder="예: 52"
              />
              <p className="text-[11px] text-gray-400">넘으면 알림만 표시 — 위반 판정이 아닙니다</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>근무 요일</Label>
            <div className="flex gap-3 flex-wrap">
              {DAY_LABELS.map((label, day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={workDays.includes(day)}
                    onCheckedChange={(v) =>
                      setWorkDays((prev) => (v ? [...prev, day].sort() : prev.filter((d) => d !== day)))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Button onClick={savePolicy} disabled={isPending}>저장</Button>
        </div>
      )}

      {/* ── 공휴일 ── */}
      {tab === 'holidays' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="text-xs text-gray-500">
            회사가 쉬는 날을 직접 등록하세요 (법정 공휴일 자동 반영은 하지 않습니다). 휴가 일수 계산에서 제외됩니다.
          </p>
          <div className="flex gap-2">
            <Input type="date" value={holDate} onChange={(e) => setHolDate(e.target.value)} className="w-40" />
            <Input value={holName} onChange={(e) => setHolName(e.target.value)} placeholder="이름 (예: 설날)" />
            <Button onClick={submitHoliday} disabled={isPending}><Plus size={15} /></Button>
          </div>
          {holidays.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">{year}년 등록된 공휴일이 없습니다</p>
          ) : (
            <div className="divide-y">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-2">
                  <p className="text-sm text-gray-900">
                    {dayjs(h.holiday_date).format('M/D')} ({DAY_LABELS[dayjs(h.holiday_date).day()]}) · {h.name}
                  </p>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400" disabled={isPending}
                    onClick={() => startTransition(async () => {
                      const res = await deleteHoliday(h.id);
                      if (res?.error) toast.error(res.error);
                      else router.refresh();
                    })}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 휴가 종류 ── */}
      {tab === 'types' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="이름 (예: 여름휴가)" className="w-40" />
            <Input type="number" step={0.5} min={0.5} value={typeWeight} onChange={(e) => setTypeWeight(e.target.value)} className="w-24" title="1일당 차감 가중치" />
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={typeDeducts} onCheckedChange={(v) => setTypeDeducts(!!v)} />
              연차 차감
            </label>
            <Button onClick={submitType} disabled={isPending}><Plus size={15} /></Button>
          </div>
          <p className="text-[11px] text-gray-400">가중치: 반차처럼 하루가 0.5일로 계산되는 종류는 0.5로 설정</p>
          <div className="divide-y">
            {types.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2">
                <p className="text-sm text-gray-900">
                  {t.name}
                  <span className="text-gray-400"> · {t.day_weight}일 단위{t.deducts_annual ? ' · 연차 차감' : ' · 차감 없음'}</span>
                </p>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400" disabled={isPending}
                  onClick={() => startTransition(async () => {
                    const res = await deleteLeaveType(t.id);
                    if (res?.error) toast.error(res.error);
                    else router.refresh();
                  })}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 연차 부여 ── */}
      {tab === 'balances' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="text-xs text-gray-500">
            {year}년 부여량을 멤버별로 입력하세요. <b>부여량은 자동 산정되지 않습니다</b> — 회사가 정한 값을 입력하면
            시스템은 승인된 휴가만큼 차감해 잔여를 보여줍니다.
          </p>
          <div className="divide-y">
            {balances.map((b) => (
              <div key={b.user_id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{b.name}</p>
                  <p className="text-xs text-gray-400">사용 {b.used}일 · 잔여 {b.remaining}일</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Input
                    type="number" step={0.5} min={0}
                    className="w-24 h-8 text-right"
                    defaultValue={b.granted}
                    onChange={(e) => setGrantEdit((prev) => ({ ...prev, [b.user_id]: e.target.value }))}
                  />
                  <span className="text-xs text-gray-400">일</span>
                  <Button size="sm" variant="outline" className="h-8" disabled={isPending || grantEdit[b.user_id] == null}
                    onClick={() => saveGranted(b)}>
                    저장
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 관리자 ── */}
      {tab === 'managers' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="text-xs text-gray-500">
            근태 관리자만 팀 현황 조회와 이 설정 화면을 사용할 수 있습니다.
            워크스페이스 소유자는 항상 관리자를 지정할 수 있습니다 (잠금 방지).
          </p>
          <div className="flex gap-2">
            <Select value={newManagerId} onValueChange={setNewManagerId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="멤버 선택" /></SelectTrigger>
              <SelectContent>
                {nonManagerMembers.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.name}{m.department && ` · ${m.department}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addManager} disabled={isPending}>
              <ShieldCheck size={15} className="mr-1" /> 권한 부여
            </Button>
          </div>
          {managers.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              아직 지정된 관리자가 없습니다 — 첫 관리자를 지정하세요
            </p>
          ) : (
            <div className="divide-y">
              {managers.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400">
                      {m.granted_by_name && `${m.granted_by_name} 님이 부여 · `}{dayjs(m.created_at).format('YYYY.M.D')}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-gray-400" disabled={isPending} onClick={() => removeManager(m)}>
                    회수
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
