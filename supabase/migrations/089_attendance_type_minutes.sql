-- 089: 근무 형태별 시간 집계 — 사무실/재택/외근을 개별 수집 (경영진·인사팀 판단용)
--
-- 문제: work_type은 하루 1개 컬럼이라, 재출근으로 형태가 바뀌면(오전 사무실→오후 외근)
--       근무시간을 형태별로 쪼갤 수 없었다.
-- 해결: type_minutes(jsonb)에 세션이 닫힐 때마다 그 세션 형태로 근무분을 누적한다.
--       예: {"office": 240, "field": 180}. worked_minutes(총합)는 이 값들의 합과 같다.
--   - clockOut이 이번 세션 형태(work_type)에 세션 근무분을 더한다.
--   - 집계는 관리자가 RLS로 팀 전체를 읽어 type_minutes를 합산 (anon+RLS, service role 안 씀).

alter table attendance_records
  add column if not exists type_minutes jsonb not null default '{}'::jsonb;

-- 백필: 완료된 기존 기록은 전체 근무분을 그 날의 work_type에 귀속
update attendance_records
  set type_minutes = jsonb_build_object(work_type, worked_minutes)
  where worked_minutes is not null and worked_minutes > 0
    and type_minutes = '{}'::jsonb;
