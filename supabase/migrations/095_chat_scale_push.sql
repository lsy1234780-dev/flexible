-- 095: 채팅 스케일 개선 + 웹푸시 구독 (P0)
--
-- ① message_reactions replica identity full
--    realtime DELETE 페이로드는 기본(replica identity default)이면 PK(id)만 담긴다.
--    클라이언트가 "어느 메시지의 반응이 지워졌는지"를 알아야 그 메시지 한 건만
--    다시 그릴 수 있으므로(전체 재조회 제거), old row 전체를 페이로드에 싣는다.
--    반응 행은 작아서(이모지 1개) 오버헤드 무시 가능.
--
-- ② push_subscriptions — 브라우저 웹푸시 구독 저장소
--    유저 멘션(@사람)·DM 수신 시 앱이 닫혀 있어도 알림을 보내기 위한 엔드포인트.
--    한 유저가 기기/브라우저마다 하나씩 가진다. endpoint가 전역 유니크.
--    발송은 서버(service role)에서만 하고, 클라이언트는 자기 것만 조회/삭제.

-- ① 반응 DELETE 페이로드에 message_id 포함
alter table message_reactions replica identity full;

-- ② 웹푸시 구독
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade, -- 등록 시점 워크스페이스(북키핑용 — 발송은 user_id 기준)
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index idx_push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- 본인 것만 조회/삭제 (등록·발송은 서버 service role 경유라 RLS 미적용)
create policy own_subscriptions on push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());
create policy own_subscriptions_delete on push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());
