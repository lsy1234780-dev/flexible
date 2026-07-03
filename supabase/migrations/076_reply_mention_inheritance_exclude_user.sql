-- 076: 075 보완 — 사람(@유저) 멘션은 답글에 상속하지 않는다.
--
-- 문제: 075는 부모 메시지의 모든 멘션을 답글에 그대로 복사한다.
--       루트 메시지에 @이상용(entity_type='user')이 있으면, 그 스레드에 답글이 달릴 때마다
--       이상용에게 "멘션됨" 알림이 반복 발생한다 — 한 번 태그됐을 뿐인데 답글마다 재알림되는 스팸.
--       사람 멘션은 "이 특정 메시지를 봐달라"는 1회성 의도이지 스레드 전체의 의도가 아니다.
--
-- 해결: entity_type = 'user'는 상속 대상에서 제외. 업무 레코드(order/product/company/...)만 상속한다.

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
      and mm.entity_type <> 'user'
    on conflict (message_id, entity_type, entity_id) do nothing;
  end if;
  return new;
end;
$$;
