-- 052: 멀티테넌시 Phase 0 — 워크스페이스 토대 (영향 0)

-- 테넌트 본체
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'basic' check (plan in ('basic','standard','premium')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

-- 유저 ↔ 워크스페이스 멤버십
create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index idx_workspace_members_user on workspace_members(user_id);
create index idx_workspace_members_ws on workspace_members(workspace_id);

-- 모듈 on/off (프로토타입의 "조립"이 실제로 사는 곳)
create table workspace_modules (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  primary key (workspace_id, module_key)
);

-- 헬퍼: 현재 로그인 유저가 속한 워크스페이스 id 집합 (RLS 정책의 핵심)
create or replace function current_workspace_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select workspace_id from workspace_members where user_id = auth.uid()
$$;

-- 신규 3개 테이블 RLS (멤버만 읽기, 쓰기는 service role)
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table workspace_modules enable row level security;

create policy workspaces_member_read on workspaces
  for select using (id in (select current_workspace_ids()));

create policy workspace_members_self_read on workspace_members
  for select using (user_id = auth.uid() or workspace_id in (select current_workspace_ids()));

create policy workspace_modules_member_read on workspace_modules
  for select using (workspace_id in (select current_workspace_ids()));
