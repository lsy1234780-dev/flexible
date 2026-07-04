-- 084: 경비 영수증·이체증 Storage (chat-attachments 067 패턴)
--
-- 경로 규칙 (expense-receipts 버킷, 비공개):
--   영수증:  {workspace_id}/{claim_id}/{uuid}-{filename}
--   이체증:  {workspace_id}/batch/{uuid}-{filename}   (정산 배치 — 재무 전용)

insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

-- 경로 기반 접근 판정 헬퍼 (읽기/쓰기 분기)
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

  -- 영수증: 청구 소유자 + 재무 담당 읽기 / 쓰기는 소유자가 draft일 때만
  begin
    select user_id, status, workspace_id into v_claim
      from expense_claims where id = seg[2]::uuid;
  exception when others then
    return false;
  end;
  if v_claim is null or v_claim.workspace_id <> v_ws then return false; end if;

  if p_write then
    return v_claim.user_id = auth.uid() and v_claim.status = 'draft';
  end if;
  return v_claim.user_id = auth.uid() or is_expense_manager(v_ws);
end;
$$;

revoke execute on function can_access_expense_object(text, boolean) from public, anon;
grant execute on function can_access_expense_object(text, boolean) to authenticated, service_role;

create policy expense_receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and can_access_expense_object(name, true)
  );

create policy expense_receipts_select on storage.objects for select to authenticated
  using (
    bucket_id = 'expense-receipts'
    and can_access_expense_object(name, false)
  );

-- 삭제: 업로더 본인만 (draft 중 영수증 교체용)
create policy expense_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts' and owner = (select auth.uid()));
