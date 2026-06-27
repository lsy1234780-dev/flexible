-- 057: CRM 일반화 — crm_logs를 "아무 레코드에나 붙는 범용 활동 로그"로 변형
--
-- 배경: crm_logs는 거래처(company) 전용 활동 피드였음. 이걸 일반화해
-- 거래처·딜·주문·AS 등 어떤 레코드든 활동이 쌓이게 만든다(통합 타임라인의 토대).
-- deal_activities를 따로 만들지 않고 여기로 통일한다.
-- 기존 동작/데이터 100% 호환 (company_id·order_id 유지, 백필).

-- 1) 다형성 대상 + 활동 메타 컬럼 추가
alter table crm_logs add column if not exists entity_type text;   -- 'company','deal','order','as_request'...
alter table crm_logs add column if not exists entity_id uuid;     -- 그 레코드 id (FK 없음 — 멘션과 동일 다형성)
alter table crm_logs add column if not exists kind text not null default 'system'
  check (kind in ('system','note','call','meeting','task','stage_change','email'));
alter table crm_logs add column if not exists due_at timestamptz; -- task 마감 (팔로업)
alter table crm_logs add column if not exists done boolean not null default false;

-- 2) company_id를 nullable로 (거래처 없는 활동도 허용 — 예: 회사 미연결 딜)
alter table crm_logs alter column company_id drop not null;

-- 3) 기존 데이터 백필: 전부 company 활동으로 귀속
update crm_logs set entity_type = 'company', entity_id = company_id
  where entity_type is null and company_id is not null;

-- 4) 기존 '메모' 액션은 note로 분류 (나머지 자동이벤트는 system 유지)
update crm_logs set kind = 'note' where action = '메모';

-- 5) 인덱스: 레코드별 타임라인(역방향) + 미완료 task(팔로업 대시보드)
create index if not exists idx_crm_logs_entity on crm_logs (entity_type, entity_id, created_at desc);
create index if not exists idx_crm_logs_open_task on crm_logs (workspace_id, due_at)
  where kind = 'task' and done = false;
