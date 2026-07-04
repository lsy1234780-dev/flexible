import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { getWorkspaceMembers } from '@/actions/chat';
import { getCurrentUser } from '@/actions/auth';
import { toCsv, csvResponse } from '@/lib/csv';

// 월 근태 CSV export (근태 관리자 전용) — 급여SW(더존·이카운트·flex 등) 임포트용.
// type: daily(일별 상세) | summary(인별 요약) | leaves(휴가 내역) | overtime(승인 초과근무)
//
// 철칙: 기록과 합계만 내보낸다. 연장·야간 수당 계산은 급여SW 몫 — "수당" 컬럼은 없다.
// 시간은 분 단위 정수(임포트 안전) + 시각은 HH:mm 그대로.

const WORK_TYPE_LABEL: Record<string, string> = { office: '사무실', remote: '재택', field: '외근' };
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get('year') ?? '', 10);
  const month = parseInt(url.searchParams.get('month') ?? '', 10);
  const type = url.searchParams.get('type') ?? 'daily';
  if (!year || !month) return new Response('year/month가 필요합니다', { status: 400 });

  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const { data: isMgr } = await supabase.rpc('is_attendance_manager', { p_ws: ws });
  if (isMgr !== true) return new Response('근태 관리자만 내보낼 수 있습니다', { status: 403 });

  const start = dayjs(new Date(year, month - 1, 1));
  const from = start.format('YYYY-MM-DD');
  const to = start.endOf('month').format('YYYY-MM-DD');
  const ym = start.format('YYYY-MM');

  // 이름 매핑
  const me = await getCurrentUser();
  const members = await getWorkspaceMembers();
  const nameOf = (id: string) =>
    members.find((m) => m.user_id === id)?.name ?? (me?.id === id ? me.name : id.slice(0, 8));

  if (type === 'daily') {
    const [{ data: records }, { data: leaves }] = await Promise.all([
      supabase.from('attendance_records').select('*')
        .gte('work_date', from).lte('work_date', to)
        .order('work_date').order('user_id'),
      supabase.from('leave_requests').select('user_id, start_date, end_date, leave_types(name)')
        .eq('status', 'approved').lte('start_date', to).gte('end_date', from),
    ]);
    const leaveOn = (userId: string, date: string) => {
      const l = (leaves ?? []).find((x) => x.user_id === userId && x.start_date <= date && date <= x.end_date);
      return l ? ((l.leave_types as unknown as { name: string } | null)?.name ?? '휴가') : '';
    };
    const rows = (records ?? []).map((r) => {
      const tm = (r.type_minutes as Record<string, number> | null) ?? {};
      return [
        nameOf(r.user_id),
        r.work_date,
        DAY_LABELS[dayjs(r.work_date).day()],
        r.clock_in_at ? dayjs(r.clock_in_at).format('HH:mm') : '',
        r.clock_out_at ? dayjs(r.clock_out_at).format('HH:mm') : '',
        r.worked_minutes ?? '',
        tm.office ?? 0,
        tm.remote ?? 0,
        tm.field ?? 0,
        WORK_TYPE_LABEL[r.work_type] ?? r.work_type,
        leaveOn(r.user_id, r.work_date),
        r.memo ?? '',
      ];
    });
    const csv = toCsv(
      ['이름', '날짜', '요일', '출근', '퇴근', '총근무(분)', '사무실(분)', '재택(분)', '외근(분)', '마지막 근무형태', '휴가', '메모'],
      rows,
    );
    return csvResponse(csv, `근태_일별_${ym}.csv`);
  }

  if (type === 'summary') {
    const [{ data: records }, { data: leaves }, { data: overtimes }] = await Promise.all([
      supabase.from('attendance_records').select('user_id, worked_minutes, type_minutes, work_type')
        .gte('work_date', from).lte('work_date', to),
      supabase.from('leave_requests').select('user_id, days, leave_types(deducts_annual)')
        .eq('status', 'approved').gte('start_date', from).lte('start_date', to),
      supabase.from('overtime_requests').select('user_id, planned_minutes')
        .eq('status', 'approved').gte('work_date', from).lte('work_date', to),
    ]);

    interface Agg { days: number; total: number; office: number; remote: number; field: number; leaveDays: number; otMinutes: number }
    const byUser = new Map<string, Agg>();
    const agg = (id: string): Agg => {
      let a = byUser.get(id);
      if (!a) { a = { days: 0, total: 0, office: 0, remote: 0, field: 0, leaveDays: 0, otMinutes: 0 }; byUser.set(id, a); }
      return a;
    };
    for (const r of records ?? []) {
      const a = agg(r.user_id);
      if (r.worked_minutes) {
        a.days += 1;
        a.total += r.worked_minutes;
        const tm = { ...((r.type_minutes as Record<string, number> | null) ?? {}) };
        if (Object.keys(tm).length === 0) tm[r.work_type] = r.worked_minutes;
        a.office += tm.office ?? 0;
        a.remote += tm.remote ?? 0;
        a.field += tm.field ?? 0;
      }
    }
    for (const l of leaves ?? []) agg(l.user_id).leaveDays += Number(l.days);
    for (const o of overtimes ?? []) agg(o.user_id).otMinutes += o.planned_minutes;

    const rows = [...byUser.entries()].map(([id, a]) => [
      nameOf(id), a.days, a.total, a.office, a.remote, a.field, a.leaveDays, a.otMinutes,
    ]);
    const csv = toCsv(
      ['이름', '근무일수', '총근무(분)', '사무실(분)', '재택(분)', '외근(분)', '휴가사용(일)', '초과근무 승인(분)'],
      rows,
    );
    return csvResponse(csv, `근태_요약_${ym}.csv`);
  }

  if (type === 'leaves') {
    const { data } = await supabase
      .from('leave_requests')
      .select('user_id, user_name, start_date, end_date, days, reason, created_at, leave_types(name, deducts_annual)')
      .eq('status', 'approved')
      .gte('start_date', from).lte('start_date', to)
      .order('start_date');
    const rows = (data ?? []).map((l) => {
      const lt = l.leave_types as unknown as { name: string; deducts_annual: boolean } | null;
      return [
        l.user_name ?? nameOf(l.user_id),
        lt?.name ?? '휴가',
        l.start_date,
        l.end_date,
        Number(l.days),
        lt?.deducts_annual ? 'Y' : 'N',
        l.reason ?? '',
        dayjs(l.created_at).format('YYYY-MM-DD'),
      ];
    });
    const csv = toCsv(['이름', '종류', '시작일', '종료일', '일수', '연차차감', '사유', '신청일'], rows);
    return csvResponse(csv, `휴가_내역_${ym}.csv`);
  }

  if (type === 'overtime') {
    const { data } = await supabase
      .from('overtime_requests')
      .select('*')
      .eq('status', 'approved')
      .gte('work_date', from).lte('work_date', to)
      .order('work_date');
    const rows = (data ?? []).map((o) => [
      o.user_name ?? nameOf(o.user_id),
      o.work_date,
      dayjs(o.start_at).format('HH:mm'),
      dayjs(o.end_at).format('HH:mm'),
      o.planned_minutes,
      o.reason ?? '',
    ]);
    const csv = toCsv(['이름', '날짜', '시작', '종료', '예정(분)', '사유'], rows);
    return csvResponse(csv, `초과근무_승인_${ym}.csv`);
  }

  return new Response('알 수 없는 type입니다', { status: 400 });
}
