'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { getCurrentUser } from '@/actions/auth';
import { getEnabledModules } from '@/actions/modules';

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

export async function getWorkspaceMembers(): Promise<{ user_id: string; name: string; email: string }[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_workspace_members');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function startDirectMessage(otherUserId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_or_create_dm', { p_other: otherUserId });
  if (error) return { error: error.message };
  return { success: true, id: data as string };
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
    .select('id, author_id, author_name, body, created_at, reply_to, message_mentions(entity_type, entity_id, label), message_reactions(emoji, user_id)')
    .eq('channel_id', channelId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}

export async function sendMessage(
  channelId: string,
  body: string,
  mentions: MentionInput[] = [],
  replyTo: string | null = null,
) {
  const text = body.trim();
  if (!text && mentions.length === 0) return { error: '메시지를 입력하세요' };

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
  return { success: true, id: msg.id };
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

// 모듈 ↔ 엔티티 카테고리 매핑. 켜진 모듈의 카테고리만 멘션 메뉴에 노출된다.
const MENTION_CATEGORIES = [
  { module: 'partners', type: 'company', label: '거래처' },
  { module: 'crm_pipeline', type: 'deal', label: '딜' },
  { module: 'products', type: 'product', label: '제품' },
  { module: 'orders', type: 'order', label: '수주' },
] as const;

// @ 클릭 시 뜨는 카테고리 메뉴 (워크스페이스에서 켜진 모듈만)
export async function getMentionCategories(): Promise<{ type: string; label: string }[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const enabled = await getEnabledModules();
  return MENTION_CATEGORIES
    .filter((c) => enabled.includes(c.module))
    .map(({ type, label }) => ({ type, label }));
}

// 특정 카테고리(type) 안에서 검색. query 비면 최근 항목.
export async function getMentionCandidates(query: string, type: string): Promise<MentionInput[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const q = query.trim();
  const N = 8;

  switch (type) {
    case 'company': {
      const base = supabase.from('companies').select('id, name');
      const { data } = await (q
        ? base.ilike('name', `%${q}%`).limit(N)
        : base.order('created_at', { ascending: false }).limit(N));
      return (data ?? []).map((c) => ({ entity_type: 'company', entity_id: c.id, label: c.name }));
    }
    case 'deal': {
      const base = supabase.from('deals').select('id, title');
      const { data } = await (q
        ? base.ilike('title', `%${q}%`).limit(N)
        : base.order('updated_at', { ascending: false }).limit(N));
      return (data ?? []).map((d) => ({ entity_type: 'deal', entity_id: d.id, label: d.title }));
    }
    case 'product': {
      const base = supabase.from('products').select('id, name');
      const { data } = await (q
        ? base.ilike('name', `%${q}%`).limit(N)
        : base.order('created_at', { ascending: false }).limit(N));
      return (data ?? []).map((p) => ({ entity_type: 'product', entity_id: p.id, label: p.name }));
    }
    case 'order': {
      const base = supabase.from('orders').select('id, order_number');
      const { data } = await (q
        ? base.ilike('order_number', `%${q}%`).limit(N)
        : base.order('created_at', { ascending: false }).limit(N));
      return (data ?? []).map((o) => ({ entity_type: 'order', entity_id: o.id, label: o.order_number ?? o.id.slice(0, 8) }));
    }
    default:
      return [];
  }
}
