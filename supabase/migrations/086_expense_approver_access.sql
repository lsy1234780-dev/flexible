-- 086: 경비 결재자 열람 권한 — "승인할 사람이 내용을 못 보는" 구멍 수정
--
-- 083의 RLS는 경비를 본인+재무 담당만 조회하게 잠갔다 (금액·사용처 민감).
-- 그런데 결재자는 건별 지정(아무 멤버나 가능)이라, 재무 담당이 아닌 결재자(예: 팀장)는
-- 자기가 승인할 경비의 상세(라인·영수증)를 못 열어 승인 진행이 불가능했다.
-- → 그 경비의 결재자로 지정된 사람에게만 조회를 추가 허용한다 (다른 사람 경비는 여전히 비공개).

-- ① 경비 헤더 조회: 본인 / 재무 담당 / 이 건의 결재자
drop policy expense_claims_select on expense_claims;
create policy expense_claims_select on expense_claims for select
  using (
    workspace_id in (select current_workspace_ids())
    and (
      user_id = (select auth.uid())
      or is_expense_manager(workspace_id)
      or exists (
        select 1 from approvals a
        where a.entity_type = 'expense'
          and a.entity_id = expense_claims.id
          and a.approver_id = (select auth.uid())
      )
    )
  );
-- 라인(expense_claim_items)은 "부모 헤더가 보이면 조회 가능"이라 자동으로 따라온다.

-- ② 영수증 열람: 결재자도 읽기 허용 (쓰기는 여전히 소유자 draft만)
create or replace function can_access_expense_object(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  seg text[] := storage.foldername(p_name);
  v_ws uuid;
  v_claim_id uuid;
  v_claim record;
begin
  if array_length(seg, 1) < 2 then return false; end if;

  begin
    v_ws := seg[1]::uuid;
  exception when others then
    return false;
  end;

  if v_ws not in (select current_workspace_ids()) then return false; end if;

  -- 이체증 (정산 배치): 재무 담당만 읽기/쓰기
  if seg[2] = 'batch' then
    return is_expense_manager(v_ws);
  end if;

  -- 영수증: 소유자 + 재무 + 이 건의 결재자 읽기 / 쓰기는 소유자가 draft일 때만
  begin
    v_claim_id := seg[2]::uuid;
  exception when others then
    return false;
  end;

  select user_id, status, workspace_id into v_claim
    from expense_claims where id = v_claim_id;
  if v_claim is null or v_claim.workspace_id <> v_ws then return false; end if;

  if p_write then
    return v_claim.user_id = auth.uid() and v_claim.status = 'draft';
  end if;
  return v_claim.user_id = auth.uid()
    or is_expense_manager(v_ws)
    or exists (
      select 1 from approvals a
      where a.entity_type = 'expense'
        and a.entity_id = v_claim_id
        and a.approver_id = auth.uid()
    );
end;
$$;

revoke execute on function can_access_expense_object(text, boolean) from public, anon;
grant execute on function can_access_expense_object(text, boolean) to authenticated, service_role;
