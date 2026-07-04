-- 083: 경비 모듈 코어 (expenses) — docs/architecture/HR.md §5
--
-- 흐름: "돈 씀 → 증빙 → 신청 → 결재 → 정산". 헤더+라인 구조 (구매발주 PO 패턴).
-- 두 모드: reimbursement(개인 경비 환급) / corporate_card(법인카드 사후 등록 — 환급 없음, 증빙만).
--
-- 정산 상태머신 = B안 (오너 확정, 2026-07-04): 두 트랙 분리.
--   ① 지급상태(회계, settle_status): 재무가 이체하면 즉시 '지급완료' — 직원 클릭에 인질 안 잡힘.
--   ② 수령확인(직원, confirm_status): 확인/이의제기 양방향 + 14일 무응답은 "미이의 마감"(auto_closed).
--      안 누른 걸 '확인함'으로 기록하지 않는다 — closed_by('employee'|'auto')로 경로 구분.
--
-- 결재는 approvals 재사용(entity_type='expense'). 재무 담당 = expense_managers 명시 부여(+ owner fallback).

-- ─── 경비 담당(재무) — 명시적 권한 부여 (attendance_managers와 동일 패턴) ───
create table expense_managers (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_by_name text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index idx_expense_managers_user on expense_managers(user_id);

create or replace function is_expense_manager(p_ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from expense_managers
    where workspace_id = p_ws and user_id = auth.uid()
  ) or exists (
    select 1 from workspace_members
    where workspace_id = p_ws and user_id = auth.uid() and role = 'owner'
  )
$$;

revoke execute on function is_expense_manager(uuid) from public, anon;
grant execute on function is_expense_manager(uuid) to authenticated, service_role;

-- ─── 경비 항목 (회사 정의) ───
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_expense_categories_ws on expense_categories(workspace_id, sort_order);

create or replace function seed_default_expense_categories(p_ws uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from workspace_members where workspace_id = p_ws and user_id = auth.uid()
  ) then
    raise exception 'not a member of workspace';
  end if;

  if exists (select 1 from expense_categories where workspace_id = p_ws) then
    return;
  end if;

  insert into expense_categories (workspace_id, name, sort_order) values
    (p_ws, '교통', 0),
    (p_ws, '식대', 1),
    (p_ws, '숙박', 2),
    (p_ws, '접대', 3),
    (p_ws, '소모품', 4),
    (p_ws, '기타', 5);
end;
$$;

revoke execute on function seed_default_expense_categories(uuid) from public, anon;
grant execute on function seed_default_expense_categories(uuid) to authenticated, service_role;

-- ─── 정산 배치 (재무가 실제 이체 시점에 묶어서 지급 — purchase_order_payments 철학) ───
create table expense_settlement_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,                 -- "7월 1차 경비 정산" 등
  transfer_date date not null,         -- 이체일
  note text,
  proof_path text,                     -- 이체증 (expense-receipts 버킷, {ws}/batch/…)
  proof_name text,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create index idx_expense_batches_ws on expense_settlement_batches(workspace_id, created_at desc);

-- ─── 경비 신청 헤더 ───
create table expense_claims (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,                      -- 표시용 스냅샷
  title text not null,
  claim_kind text not null default 'reimbursement'
    check (claim_kind in ('reimbursement', 'corporate_card')),
  total_amount numeric not null default 0,   -- 라인 합계 (서버가 draft 중 재계산)
  -- 결재 트랙 (approvals 동기화)
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  -- 회계 트랙 (B안 ①) — corporate_card는 환급 없음이라 'none'
  settle_status text not null default 'unpaid'
    check (settle_status in ('none', 'unpaid', 'paid')),
  settlement_batch_id uuid references expense_settlement_batches(id) on delete set null,
  paid_at timestamptz,
  -- 수령확인 트랙 (B안 ②)
  confirm_status text not null default 'none'
    check (confirm_status in ('none', 'awaiting', 'confirmed', 'disputed', 'auto_closed')),
  confirm_due_at timestamptz,          -- awaiting 진입 시 +14일
  confirmed_at timestamptz,
  closed_by text check (closed_by in ('employee', 'auto')),
  dispute_note text,
  created_at timestamptz not null default now()
);
create index idx_expense_claims_ws on expense_claims(workspace_id, created_at desc);
create index idx_expense_claims_user on expense_claims(user_id, created_at desc);
create index idx_expense_claims_settle on expense_claims(workspace_id, status, settle_status);
create index idx_expense_claims_batch on expense_claims(settlement_batch_id);

-- ─── 경비 라인 ───
create table expense_claim_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  claim_id uuid not null references expense_claims(id) on delete cascade,
  category_id uuid references expense_categories(id) on delete set null,
  amount numeric not null check (amount > 0),
  vat_amount numeric,
  spent_at date not null,
  merchant text,                       -- 사용처
  payment_method text not null default 'personal'
    check (payment_method in ('personal', 'corporate_card')),
  receipt_path text,                   -- 영수증 (expense-receipts 버킷)
  receipt_name text,
  memo text,
  created_at timestamptz not null default now()
);
create index idx_expense_items_claim on expense_claim_items(claim_id);
create index idx_expense_items_category on expense_claim_items(category_id);

-- ─── 승인(approvals) → 경비 결재 상태 동기화 (leave와 동일 패턴) ───
create or replace function sync_expense_claim_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entity_type = 'expense'
     and old.status = 'pending'
     and new.status in ('approved', 'rejected') then
    perform set_config('app.expense_sync', '1', true);
    update expense_claims
      set status = new.status
      where id = new.entity_id and status = 'pending';
    perform set_config('app.expense_sync', '0', true);
  end if;
  return new;
end;
$$;

create trigger approvals_sync_expense
  after update on approvals
  for each row execute function sync_expense_claim_approval();

revoke execute on function sync_expense_claim_approval() from public, anon, authenticated;

-- ─── 경비 헤더 상태머신 가드 — 돈이 걸린 전이를 DB에서 강제 ───
create or replace function expense_claims_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mgr boolean := is_expense_manager(old.workspace_id);
  v_owner boolean := (auth.uid() = old.user_id);
begin
  -- 불변 컬럼
  if new.user_id <> old.user_id
     or new.workspace_id <> old.workspace_id
     or new.claim_kind <> old.claim_kind then
    raise exception '변경할 수 없는 항목입니다';
  end if;

  -- ① 승인 동기화 경유: 결재 상태 pending → approved/rejected 만
  if coalesce(current_setting('app.expense_sync', true), '0') = '1' then
    if old.status = 'pending' and new.status in ('approved', 'rejected')
       and new.settle_status = old.settle_status
       and new.confirm_status = old.confirm_status then
      return new;
    end if;
    raise exception 'invalid expense sync transition';
  end if;

  -- ② 결재 상태: approvals 밖에서는 요청자의 draft→pending(결재요청), draft/pending→cancelled 만
  if new.status is distinct from old.status then
    if v_owner and old.status = 'draft' and new.status = 'pending' then
      null; -- ok (결재 요청)
    elsif v_owner and old.status in ('draft', 'pending') and new.status = 'cancelled' then
      null; -- ok (본인 취소)
    else
      raise exception '결재 상태는 승인 절차를 통해서만 변경됩니다';
    end if;
  end if;

  -- ③ 제목/총액: draft에서 본인만 (총액은 라인 변경 시 서버 재계산)
  if (new.title is distinct from old.title or new.total_amount is distinct from old.total_amount)
     and not (v_owner and old.status = 'draft') then
    raise exception '작성 중(draft) 상태에서만 수정할 수 있습니다';
  end if;

  -- ④ 회계 트랙 (지급): 재무만, 승인된 환급 건만. unpaid→paid(이체 마킹) / paid→unpaid(이체 취소 롤백)
  if new.settle_status is distinct from old.settle_status
     or new.settlement_batch_id is distinct from old.settlement_batch_id
     or new.paid_at is distinct from old.paid_at then
    if not v_mgr then
      raise exception '지급 처리는 경비 담당자만 할 수 있습니다';
    end if;
    if old.claim_kind <> 'reimbursement' then
      raise exception '법인카드 건은 지급(환급) 대상이 아닙니다';
    end if;
    if old.status <> 'approved' and new.status <> 'approved' then
      raise exception '승인된 건만 지급 처리할 수 있습니다';
    end if;
    if not (
      (old.settle_status = 'unpaid' and new.settle_status = 'paid')
      or (old.settle_status = 'paid' and new.settle_status = 'unpaid')  -- 이체 취소 롤백
      or (new.settle_status = old.settle_status)                        -- batch/paid_at만 정정
    ) then
      raise exception '허용되지 않는 지급 상태 전이입니다';
    end if;
  end if;

  -- ⑤ 수령확인 트랙
  if new.confirm_status is distinct from old.confirm_status then
    if old.confirm_status = 'none' and new.confirm_status = 'awaiting' then
      -- 지급 통지 (재무) — 이 시점에 confirm_due_at 필수
      if not v_mgr then raise exception '지급 통지는 경비 담당자만 할 수 있습니다'; end if;
      if new.confirm_due_at is null then raise exception 'confirm_due_at이 필요합니다'; end if;
    elsif old.confirm_status = 'awaiting' and new.confirm_status = 'confirmed' then
      -- 수령 확인 (직원 본인)
      if not v_owner then raise exception '수령 확인은 본인만 할 수 있습니다'; end if;
      if new.closed_by is distinct from 'employee' then raise exception 'closed_by=employee 필요'; end if;
    elsif old.confirm_status = 'awaiting' and new.confirm_status = 'disputed' then
      -- 이의제기 (직원 본인, 사유 필수)
      if not v_owner then raise exception '이의제기는 본인만 할 수 있습니다'; end if;
      if coalesce(trim(new.dispute_note), '') = '' then raise exception '이의제기 사유가 필요합니다'; end if;
    elsif old.confirm_status = 'disputed' and new.confirm_status = 'awaiting' then
      -- 재이체/정정 후 재통지 (재무)
      if not v_mgr then raise exception '재통지는 경비 담당자만 할 수 있습니다'; end if;
    elsif old.confirm_status = 'awaiting' and new.confirm_status = 'auto_closed' then
      -- 14일 무응답 "미이의 마감" — 기한 경과 시에만, closed_by='auto' 강제 ("확인됨"으로 기록 금지)
      if old.confirm_due_at is null or old.confirm_due_at > now() then
        raise exception '확인 기한이 지나지 않았습니다';
      end if;
      if new.closed_by is distinct from 'auto' then raise exception 'closed_by=auto 필요'; end if;
    elsif old.confirm_status = 'awaiting' and new.confirm_status = 'none' then
      -- 이체 취소 롤백과 함께 통지도 회수 (재무)
      if not v_mgr then raise exception '경비 담당자만 가능합니다'; end if;
    else
      raise exception '허용되지 않는 수령확인 전이입니다 (% → %)', old.confirm_status, new.confirm_status;
    end if;
  end if;

  return new;
end;
$$;

create trigger expense_claims_guard
  before update on expense_claims
  for each row execute function expense_claims_guard_update();

revoke execute on function expense_claims_guard_update() from public, anon, authenticated;

-- ─── 라인 잠금: draft에서만 추가/수정/삭제 (결재 요청 후엔 내용 변경 차단 — 수주/구매발주와 동일 철학) ───
create or replace function expense_items_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_claim_status text;
begin
  select status into v_claim_status
    from expense_claims
    where id = coalesce(new.claim_id, old.claim_id);
  if v_claim_status is distinct from 'draft' then
    raise exception '작성 중(draft) 상태에서만 라인을 변경할 수 있습니다';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger expense_items_guard_ins before insert on expense_claim_items
  for each row execute function expense_items_guard();
create trigger expense_items_guard_upd before update on expense_claim_items
  for each row execute function expense_items_guard();
create trigger expense_items_guard_del before delete on expense_claim_items
  for each row execute function expense_items_guard();

revoke execute on function expense_items_guard() from public, anon, authenticated;

-- ─── RLS ───
alter table expense_managers enable row level security;
alter table expense_categories enable row level security;
alter table expense_settlement_batches enable row level security;
alter table expense_claims enable row level security;
alter table expense_claim_items enable row level security;

-- 담당자 목록: 멤버 전체 조회(투명), 부여/회수는 담당자(=owner 포함)만
create policy expense_managers_select on expense_managers for select
  using (workspace_id in (select current_workspace_ids()));
create policy expense_managers_insert on expense_managers for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and is_expense_manager(workspace_id)
    and granted_by = (select auth.uid())
  );
create policy expense_managers_delete on expense_managers for delete
  using (is_expense_manager(workspace_id));

-- 항목: 멤버 읽기, 담당자 쓰기
create policy expense_categories_select on expense_categories for select
  using (workspace_id in (select current_workspace_ids()));
create policy expense_categories_insert on expense_categories for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and is_expense_manager(workspace_id)
  );
create policy expense_categories_update on expense_categories for update
  using (is_expense_manager(workspace_id))
  with check (is_expense_manager(workspace_id));
create policy expense_categories_delete on expense_categories for delete
  using (is_expense_manager(workspace_id));

-- 정산 배치: 담당자 전용
create policy expense_batches_select on expense_settlement_batches for select
  using (
    workspace_id in (select current_workspace_ids())
    and is_expense_manager(workspace_id)
  );
create policy expense_batches_insert on expense_settlement_batches for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and is_expense_manager(workspace_id)
  );
create policy expense_batches_update on expense_settlement_batches for update
  using (is_expense_manager(workspace_id))
  with check (is_expense_manager(workspace_id));

-- 경비 헤더: 본인 + 담당자만 (휴가와 달리 금액·사용처가 민감 — 팀 전체 공개 안 함)
create policy expense_claims_select on expense_claims for select
  using (
    workspace_id in (select current_workspace_ids())
    and (user_id = (select auth.uid()) or is_expense_manager(workspace_id))
  );
create policy expense_claims_insert on expense_claims for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and user_id = (select auth.uid())
    and status = 'draft'
  );
create policy expense_claims_update on expense_claims for update
  using (
    workspace_id in (select current_workspace_ids())
    and (user_id = (select auth.uid()) or is_expense_manager(workspace_id))
  )
  with check (
    workspace_id in (select current_workspace_ids())
    and (user_id = (select auth.uid()) or is_expense_manager(workspace_id))
  );
create policy expense_claims_delete on expense_claims for delete
  using (user_id = (select auth.uid()) and status = 'draft');

-- 라인: 부모 헤더가 보이면 조회 가능, 쓰기는 헤더 소유자만 (draft 강제는 트리거)
create policy expense_items_select on expense_claim_items for select
  using (exists (select 1 from expense_claims c where c.id = expense_claim_items.claim_id));
create policy expense_items_insert on expense_claim_items for insert
  with check (
    workspace_id in (select current_workspace_ids())
    and exists (
      select 1 from expense_claims c
      where c.id = expense_claim_items.claim_id and c.user_id = (select auth.uid())
    )
  );
create policy expense_items_update on expense_claim_items for update
  using (exists (
    select 1 from expense_claims c
    where c.id = expense_claim_items.claim_id and c.user_id = (select auth.uid())
  ));
create policy expense_items_delete on expense_claim_items for delete
  using (exists (
    select 1 from expense_claims c
    where c.id = expense_claim_items.claim_id and c.user_id = (select auth.uid())
  ));
