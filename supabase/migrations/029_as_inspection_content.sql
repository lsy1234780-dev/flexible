-- 검수사항 컬럼 추가 (검수자가 진단한 실제 고장 원인)
alter table as_requests
  add column if not exists inspection_content text;
