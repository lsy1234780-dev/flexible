-- AS 요청서 (After Service)
create table if not exists as_requests (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,             -- AS-2026-001 형태
  company_id uuid references companies(id) on delete set null,
  customer_name text,                      -- 고객/담당자명
  customer_phone text,                     -- 연락처
  product_name text not null,              -- 자유 입력 (제품명)
  product_id uuid references products(id) on delete set null,
  serial_number text,                      -- 시리얼 번호
  symptom text not null,                   -- 증상 설명
  defective_parts text[] default '{}',     -- 고장 부위 배열
  repair_content text,                     -- 수리 내용 (수리 후 기입)
  status text check (status in ('received', 'inspecting', 'repairing', 'completed', 'returned')) default 'received',
  assigned_to text,                        -- 담당자 이름
  estimated_completion_at date,            -- 완료 예정일
  completed_at timestamptz,
  repair_cost numeric,
  memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- AS 처리 이력 (상태 변경 메모)
create table if not exists as_logs (
  id uuid primary key default gen_random_uuid(),
  as_request_id uuid references as_requests(id) on delete cascade,
  status text not null,
  content text,
  created_by_name text,
  created_at timestamptz default now()
);

-- updated_at 자동 갱신
create or replace function update_as_requests_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_as_requests_updated_at on as_requests;
create trigger trg_as_requests_updated_at
  before update on as_requests
  for each row execute function update_as_requests_updated_at();

-- RLS
alter table as_requests enable row level security;
alter table as_logs enable row level security;

create policy "authenticated read as_requests" on as_requests
  for select to authenticated using (true);
create policy "authenticated write as_requests" on as_requests
  for all to authenticated using (true) with check (true);

create policy "authenticated read as_logs" on as_logs
  for select to authenticated using (true);
create policy "authenticated write as_logs" on as_logs
  for all to authenticated using (true) with check (true);
