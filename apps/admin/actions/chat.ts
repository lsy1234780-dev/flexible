'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { getCurrentUser } from '@/actions/auth';
import { getEnabledModules } from '@/actions/modules';
import { entitiesForModules, getEntityDef } from '@/lib/moduleRegistry';

export interface MentionInput {
  entity_type: string;
  entity_id: string;
  label: string;
}

// ─── 채널 ───

export async function getChannels() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  // 공개 채널 + 내 DM (상대 이름 + 안읽음 포함)
  let { data, error } = await supabase.rpc('get_my_channels');
  if (error) throw new Error(error.message);

  // chat 모듈 켜고 처음 들어오면 #general 자동 생성(멱등)
  if (!data || data.length === 0) {
    const ws = await getCurrentWorkspaceId();
    await supabase.rpc('seed_default_channels', { p_ws: ws });
    ({ data, error } = await supabase.rpc('get_my_channels'));
    if (error) throw new Error(error.message);
  }
  return data ?? [];
}

// 채널 진입 시 읽음 처리
export async function markChannelRead(channelId: string) {
  const supabase = await createClient();
  await supabase.rpc('mark_channel_read', { p_channel: channelId });
}

// ─── 다이렉트 메시지 ───

export interface WorkspaceMember {
  user_id: string;
  name: string;
  email: string;
  department: string | null;
}

export async function getWorkspaceMembers(): Promise<WorkspaceMember[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_workspace_members');
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkspaceMember[];
}

export async function startDirectMessage(otherUserId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_or_create_dm', { p_other: otherUserId });
  if (error) return { error: error.message };
  return { success: true, id: data as string };
}

// ─── 레코드 → 채팅 공유 (역방향) ───
// 어느 레코드 화면이든 <ShareToChat>가 호출. 엔티티를 멘션으로 붙인 메시지를
// 지정 채널 또는 사람(DM)에게 메모와 함께 전송한다.
export async function shareToChat(params: {
  dest: { type: 'channel' | 'user'; id: string };
  note: string;
  mention: MentionInput;
}) {
  let channelId: string;
  if (params.dest.type === 'user') {
    const dm = await startDirectMessage(params.dest.id);
    if ('error' in dm || !dm.id) return { error: ('error' in dm && dm.error) || 'DM 생성 실패' };
    channelId = dm.id;
  } else {
    channelId = params.dest.id;
  }
  const res = await sendMessage(channelId, params.note ?? '', [params.mention]);
  if (res?.error) return { error: res.error };
  return { success: true, channelId };
}

// 나(@user)를 멘션한 메시지 알림 (안읽음 여부 포함)
export interface MyMention {
  message_id: string;
  channel_id: string | null;
  channel_name: string | null;
  channel_kind: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  is_unread: boolean;
}

export async function getMyMentions(): Promise<MyMention[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_my_mentions', { p_limit: 20 });
  if (error) throw new Error(error.message);
  return (data ?? []) as MyMention[];
}

// 이 레코드를 멘션한 대화들 (역링크 — 레코드 화면의 "관련 대화" 패널).
// RLS(mentions_select)가 내가 볼 수 있는 메시지의 멘션만 반환 → 남의 DM은 자동 제외.
export interface RecordMention {
  message_id: string;
  channel_id: string | null;
  channel_name: string | null;
  channel_kind: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export async function getRecordMentions(entityType: string, entityId: string): Promise<RecordMention[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('message_mentions')
    .select('message_id, created_at, messages(id, body, author_name, created_at, channel_id, deleted_at, channels(name, kind))')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  type Row = {
    message_id: string;
    messages: {
      id: string; body: string; author_name: string | null; created_at: string;
      channel_id: string | null; deleted_at: string | null;
      channels: { name: string | null; kind: string | null } | null;
    } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.messages && !r.messages.deleted_at)
    .map((r) => ({
      message_id: r.message_id,
      channel_id: r.messages!.channel_id,
      channel_name: r.messages!.channels?.name ?? null,
      channel_kind: r.messages!.channels?.kind ?? null,
      author_name: r.messages!.author_name,
      body: r.messages!.body,
      created_at: r.messages!.created_at,
    }));
}

export async function createChannel(name: string) {
  const clean = name.trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase();
  if (!clean) return { error: '채널 이름을 입력하세요' };
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('channels')
    .insert({ workspace_id: workspaceId, name: clean, kind: 'channel', created_by: user?.id ?? null })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { success: true, id: data.id };
}

// ─── 메시지 ───

export async function getMessages(channelId: string, limit = 100) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('id, author_id, author_name, body, created_at, edited_at, reply_to, message_mentions(entity_type, entity_id, label), message_reactions(emoji, user_id), message_attachments(id, storage_path, file_name, mime_type, size_bytes)')
    .eq('channel_id', channelId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}

export interface AttachmentInput {
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
}

export async function sendMessage(
  channelId: string,
  body: string,
  mentions: MentionInput[] = [],
  replyTo: string | null = null,
  attachments: AttachmentInput[] = [],
) {
  const text = body.trim();
  if (!text && mentions.length === 0 && attachments.length === 0) return { error: '메시지를 입력하세요' };

  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const me = await getCurrentUser();

  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      workspace_id: workspaceId,
      channel_id: channelId,
      author_id: me?.id ?? null,
      author_name: me?.name ?? '사용자',
      body: text,
      reply_to: replyTo,
    })
    .select('id')
    .single();
  if (error || !msg) return { error: error?.message ?? '전송 실패' };

  if (mentions.length > 0) {
    const { error: mErr } = await supabase.from('message_mentions').insert(
      mentions.map((m) => ({
        workspace_id: workspaceId,
        message_id: msg.id,
        entity_type: m.entity_type,
        entity_id: m.entity_id,
        label: m.label,
      })),
    );
    if (mErr) return { error: mErr.message };
  }

  if (attachments.length > 0) {
    const { error: aErr } = await supabase.from('message_attachments').insert(
      attachments.map((a) => ({
        workspace_id: workspaceId,
        message_id: msg.id,
        storage_path: a.storage_path,
        file_name: a.file_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
      })),
    );
    if (aErr) return { error: aErr.message };
  }
  return { success: true, id: msg.id };
}

// 파일 업로드 (서버에서 Storage로) → 첨부 메타데이터 반환
export async function uploadChatFile(formData: FormData) {
  const file = formData.get('file') as File | null;
  const channelId = formData.get('channelId') as string | null;
  if (!file || !channelId) return { error: '파일이 없습니다' };
  if (file.size > 25 * 1024 * 1024) return { error: '파일은 25MB 이하만 가능합니다' };

  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${workspaceId}/${channelId}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) return { error: error.message };

  const attachment: AttachmentInput = {
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
  };
  return { success: true, attachment };
}

// ─── 메시지 수정 / 삭제 (작성자 본인만) ───

export async function editMessage(messageId: string, body: string) {
  const text = body.trim();
  if (!text) return { error: '내용을 입력하세요' };
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me?.id) return { error: '로그인이 필요합니다' };

  const { data, error } = await supabase
    .from('messages')
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('author_id', me.id) // 본인 메시지만
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: '수정 권한이 없습니다' };
  return { success: true };
}

export async function deleteMessage(messageId: string) {
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me?.id) return { error: '로그인이 필요합니다' };

  const { data, error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('author_id', me.id)
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: '삭제 권한이 없습니다' };
  return { success: true };
}

// ─── 이모지 반응 (토글) ───

export async function toggleReaction(messageId: string, emoji: string) {
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me?.id) return { error: '로그인이 필요합니다' };

  // 이미 있으면 제거, 없으면 추가
  const { data: deleted, error: delErr } = await supabase
    .from('message_reactions')
    .delete()
    .match({ message_id: messageId, user_id: me.id, emoji })
    .select('id');
  if (delErr) return { error: delErr.message };
  if (deleted && deleted.length > 0) return { success: true, removed: true };

  const workspaceId = await getCurrentWorkspaceId();
  const { error: insErr } = await supabase
    .from('message_reactions')
    .insert({ workspace_id: workspaceId, message_id: messageId, user_id: me.id, emoji });
  if (insErr) return { error: insErr.message };
  return { success: true, removed: false };
}

// ─── 엔티티 멘션 (모듈별 카테고리 → 타입별 리스트) — 비전 핵심 ───

// @ 클릭 시 뜨는 카테고리 메뉴 = 켜진 모듈이 제공하는 엔티티(레지스트리에서 파생).
// 채팅은 어떤 모듈이 뭘 제공하는지 모른다 — 레지스트리만 읽는다(모듈화 OS 계약).
export async function getMentionCategories(): Promise<{ type: string; label: string }[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const enabled = await getEnabledModules();
  return entitiesForModules(enabled).map((e) => ({ type: e.type, label: e.label }));
}

// 특정 엔티티(type) 안에서 검색. query 비면 최근 항목. 레지스트리 정의로 제너릭 처리.
export async function getMentionCandidates(query: string, type: string): Promise<MentionInput[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const def = getEntityDef(type);
  if (!def) return [];
  const source = def.source;
  const q = query.trim();
  const N = 8;

  // 멤버(사람) — 테이블이 아니라 전용 RPC 경로 (MembersSource만 kind를 가짐)
  if ('kind' in source) {
    const members = await getWorkspaceMembers();
    const ql = q.toLowerCase();
    return members
      .filter((m) => !ql || m.name.toLowerCase().includes(ql) || m.email.toLowerCase().includes(ql))
      .slice(0, N)
      .map((m) => ({ entity_type: def.type, entity_id: m.user_id, label: m.name }));
  }

  // 테이블 기반 — labelColumns / searchColumns / orderColumn 으로 제너릭 쿼리
  const src = source;
  const supabase = await createClient();
  const cols = Array.from(new Set(['id', ...src.labelColumns, ...src.searchColumns])).join(', ');
  // .from(string)은 제너릭 타입을 좁히지 못하므로 동적 테이블은 캐스팅(런타임 RLS가 보장)
  const base = supabase.from(src.table as never).select(cols);
  const { data } = await (q
    ? base.or(src.searchColumns.map((c) => `${c}.ilike.%${q}%`).join(',')).limit(N)
    : base.order(src.orderColumn, { ascending: src.orderAsc ?? false }).limit(N));

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const id = String(row.id);
    const label = src.labelColumns.map((c) => row[c]).filter(Boolean).map(String).join(' · ');
    return { entity_type: def.type, entity_id: id, label: label || id.slice(0, 8) };
  });
}
