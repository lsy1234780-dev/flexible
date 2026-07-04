-- 088: 재출근 지원 — 하루 안에서 퇴근 후 다시 출근할 수 있게 (점심·외출 후 복귀)
--
-- 기존 모델: 하루 1행, clock_in_at(출근)·clock_out_at(퇴근)·worked_minutes(산수 결과) 단일 세션.
-- 문제: 퇴근을 찍으면 그날은 끝 — 다시 출근해도 그 이후 시간이 안 잡힘.
-- 해결: '현재 열린 세션의 시작(session_start_at)'을 따로 두고, 퇴근 시 그 세션의 근무시간을
--       worked_minutes에 "누적"한다. 재출근하면 session_start_at을 새로 찍어 그 시점부터 다시 산정.
--   - clock_in_at = 그날 최초 출근(표시용), clock_out_at = 마지막 퇴근(표시용)
--   - worked_minutes = 그날 세션들의 근무시간 합계 (첫 퇴근 때 휴게 1회 차감, 재출근분은 실시간 가산)

alter table attendance_records
  add column if not exists session_start_at timestamptz;

-- 백필: 지금 근무 중(출근했고 아직 퇴근 안 한)인 행은 현재 세션 시작 = 출근 시각
update attendance_records
  set session_start_at = clock_in_at
  where clock_in_at is not null and clock_out_at is null and session_start_at is null;
