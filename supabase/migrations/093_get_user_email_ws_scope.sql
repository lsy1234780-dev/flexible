-- 093: get_user_email 워크스페이스 스코프 제한
--
-- 기존(065)에는 아무 로그인 유저나 임의 uuid로 타인의 이메일을 조회할 수 있었다.
-- 조회를 다음 세 경우로 제한한다:
--   1) 본인
--   2) 내 워크스페이스의 멤버
--   3) 내 워크스페이스 소속 업체(b2b)의 계정 — 견적/주문 알림 이메일 발송 경로
-- service role 호출은 기존처럼 무제한 (다른 RPC들과 동일한 패턴).

create or replace function get_user_email(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from auth.users u
  where u.id = p_user
    and (
      (select auth.role()) = 'service_role'
      or p_user = (select auth.uid())
      or exists (
        select 1 from workspace_members wm
        where wm.user_id = p_user
          and wm.workspace_id in (select current_workspace_ids())
      )
      or exists (
        select 1 from companies c
        where c.auth_user_id = p_user
          and c.workspace_id in (select current_workspace_ids())
      )
    );
$$;
