-- 097: 메시지 불변 원칙 — 수정/삭제 차단 (제품 결정)
--
-- 채팅은 업무 기록(수주·발주 의사결정 근거)이다. 불리해졌을 때 지우거나 고칠 수
-- 없어야 하므로, 한 번 보낸 메시지는 불변으로 못 박는다. 오타는 정정 메시지로.
--
-- 이 마이그레이션이 막는 것:
-- ① 기존 messages_update 정책에 author 조건이 없어서 같은 채널 멤버가
--    PostgREST 직접 호출로 "남의" 메시지를 고치거나 삭제 표시할 수 있던 구멍 (063)
-- ② 본인 메시지 수정/삭제 (앱 기능 자체 제거와 세트)
-- ③ ERP 봇 시스템 메시지 조작
--
-- service_role은 RLS를 우회하므로 법적 요청(개인정보 삭제 등) 시 운영자가 처리할
-- 통로는 남는다. edited_at/deleted_at 컬럼은 과거 데이터 표시용으로 유지.

-- RLS 정책 제거 → UPDATE/DELETE는 default-deny
drop policy if exists messages_update on messages;
drop policy if exists messages_delete on messages;

-- 벨트 앤 서스펜더: 테이블 권한 자체도 회수 (정책 실수로 재생성돼도 안 뚫리게)
revoke update, delete on messages from authenticated, anon;

-- 멘션·첨부도 메시지 기록의 일부 — 사후 조작 차단 (생성 시 insert만 필요)
revoke update, delete on message_mentions from authenticated, anon;
revoke update, delete on message_attachments from authenticated, anon;
