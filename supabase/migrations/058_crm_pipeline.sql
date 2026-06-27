-- 058: CRM 파이프라인 (crm_pipeline 모듈) — 영업 기회(딜) 칸반
--
-- deal_activities는 만들지 않는다 → 활동은 057에서 일반화한 crm_logs로 통일
-- (entity_type='deal', entity_id=deal.id). 테이블 하나로 모든 레코드 활동을 모음.
-- workspace_id NOT NULL + 표준 ws_isolation RLS (054 패턴 그대로).

-- 1) 파이프라인 단계 (워크스페이스별 편집 가능 — "우리 입맛" 핵심)
create table deal_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  color text,
  created_at timestamptz not null default now()
);
create index idx_deal_stages_ws on deal_stages (workspace_id, sort_order);

-- 2) 딜 (영업 기회)
create table deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  company_id uuid references companies(id) on delete set null,   -- partners 모듈 연동
  stage_id uuid references deal_stages(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,    -- 담당자
  value numeric not null default 0,                              -- 예상 매출
  currency text not null default 'KRW',
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  expected_close_date date,
  source text,                                                   -- 유입 경로
  quotation_id uuid references quotations(id) on delete set null, -- 견적 모듈 연동(선택)
  order_id uuid references orders(id) on delete set null,         -- 수주 전환(선택)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_deals_ws_stage on deals (workspace_id, stage_id);
create index idx_deals_company on deals (company_id);
create index idx_deals_owner on deals (owner_id);

-- 3) RLS — 표준 워크스페이스 격리
alter table deal_stages enable row level security;
alter table deals enable row level security;

create policy ws_isolation on deal_stages for all to authenticated
  using (workspace_id in (select current_workspace_ids()))
  with check (workspace_id in (select current_workspace_ids()));

create policy ws_isolation on deals for all to authenticated
  using (workspace_id in (select current_workspace_ids()))
  with check (workspace_id in (select current_workspace_ids()));

-- 4) 기본 단계 시드 (멱등) — crm_pipeline 모듈을 켜거나 칸반 첫 진입 시 호출
create or replace function seed_default_deal_stages(p_ws uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from deal_stages where workspace_id = p_ws) then
    return; -- 이미 있으면 아무것도 안 함
  end if;
  insert into deal_stages (workspace_id, name, sort_order, kind, color) values
    (p_ws, '리드', 0, 'open',  '#94a3b8'),
    (p_ws, '상담', 1, 'open',  '#60a5fa'),
    (p_ws, '견적', 2, 'open',  '#818cf8'),
    (p_ws, '협상', 3, 'open',  '#fbbf24'),
    (p_ws, '계약', 4, 'won',   '#34d399'),
    (p_ws, '실패', 5, 'lost',  '#f87171');
end;
$$;
