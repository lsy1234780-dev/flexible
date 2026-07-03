-- 075: 답글 멘션 상속 — "채팅방 안의 채팅방"을 레코드에도 자동으로 이어붙인다.
--
-- 문제: #general에서 @수주0845를 한 번 멘션하고 답글로 대화가 이어지면,
--       첫 메시지만 message_mentions에 잡히고 나머지 답글들은 그 주문과 무관해 보인다.
--       → 나중에 ORD-0845 상세 페이지를 열어도 그 뒤 대화는 안 보임 (레코드 스레드 F안의 구멍).
--
-- 해결: messages에 reply_to가 있으면, 부모(스레드 루트) 메시지의 멘션을 자동 상속한다.
--       사람이 매 메시지마다 다시 태그할 필요 없음 — "답글" 버튼을 누르는 자연스러운 행동이
--       곧 "이 대화는 여전히 그 레코드 얘기다"라는 신호가 되도록 만든다.
--       이 채팅 UI는 flat 스레드(reply_to가 항상 스레드 루트를 가리킴)라 직계 부모만 보면 충분하다.

-- ─── 멘션 중복 방지: 트리거 삽입과 앱의 명시적 삽입이 겹칠 수 있으므로 유니크 인덱스 필요 ───
create unique index if not exists uq_message_mentions_msg_entity
  on message_mentions (message_id, entity_type, entity_id);

-- ─── 답글 삽입 시 부모 메시지의 멘션을 상속 (중복은 무시) ───
-- SECURITY DEFINER 아님(기본값=INVOKER): 메시지를 쓴 사람과 동일 권한으로 실행되어
-- message_mentions_insert RLS(workspace_id + 메시지 존재 확인)를 자연스럽게 통과한다.
create or replace function inherit_reply_mentions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reply_to is not null then
    insert into message_mentions (workspace_id, message_id, entity_type, entity_id, label)
    select new.workspace_id, new.id, mm.entity_type, mm.entity_id, mm.label
    from message_mentions mm
    where mm.message_id = new.reply_to
    on conflict (message_id, entity_type, entity_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inherit_reply_mentions on messages;
create trigger trg_inherit_reply_mentions
  after insert on messages
  for each row execute function inherit_reply_mentions();
