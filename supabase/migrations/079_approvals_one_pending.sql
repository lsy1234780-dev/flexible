-- 한 레코드에 동시에 여러 pending 승인 요청이 생기지 않게 하드 가드.
-- 앱(requestApproval)에서도 선검사하지만, 동시 요청 경합(race)까지 막으려면 DB 유니크가 필요.
-- pending만 대상 → 반려/승인 후 재요청은 정상 허용된다.
create unique index uq_approvals_one_pending
  on approvals (entity_type, entity_id)
  where status = 'pending';
