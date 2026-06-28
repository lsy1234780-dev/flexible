-- 067: 채팅 파일 첨부 — 비공개 Storage 버킷 + message_attachments
--
-- 경로 규칙: chat-attachments/{workspace_id}/{channel_id}/{uuid}-{filename}
-- storage RLS는 경로의 채널 세그먼트로 can_access_channel()을 호출 → DM 파일도 멤버만.

-- 비공개 버킷
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- 업로드: 워크스페이스 일치 + 채널 접근 가능자만
create policy chat_attach_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1]::uuid in (select current_workspace_ids())
    and can_access_channel((storage.foldername(name))[2]::uuid)
  );

-- 다운로드/조회: 채널 접근 가능자만 (DM 파일 격리)
create policy chat_attach_select on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and can_access_channel((storage.foldername(name))[2]::uuid)
  );

-- 삭제: 업로더 본인만
create policy chat_attach_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-attachments' and owner = auth.uid());

-- 첨부 메타데이터
create table message_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index idx_message_attachments_msg on message_attachments (message_id);

alter table message_attachments enable row level security;

-- 부모 메시지가 보일 때만 첨부도 보임(반응/멘션과 동일 패턴)
create policy message_attachments_select on message_attachments for select to authenticated
  using (exists (select 1 from messages m where m.id = message_attachments.message_id));
create policy message_attachments_insert on message_attachments for insert to authenticated
  with check (
    workspace_id in (select current_workspace_ids())
    and exists (select 1 from messages m where m.id = message_id)
  );
create policy message_attachments_delete on message_attachments for delete to authenticated
  using (
    exists (select 1 from messages m where m.id = message_attachments.message_id and m.author_id = auth.uid())
  );
