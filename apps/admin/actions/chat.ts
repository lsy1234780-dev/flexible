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

  let { data, error } = await supabase.from('channels').select('*').order('created_at');
  if (error) throw new Error(error.message);

  // chat 모듈 켜고 처음 들어오면 #general 자동 생성(멱등)
  if (!data || data.length === 0) {
    const ws = await getCurrentWorkspaceId();
    await supabase.rpc('seed_default_channels', { p_ws: ws });
    ({ data, error } = await supabase.from('channels').select('*').order('created_at'));
    if (error) throw new Error(error.message);
  }
  return data ?? [];
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
    .select('id, author_id, author_name, body, created_at, message_mentions(entity_type, entity_id, label)')
    .eq('channel_id', channelId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}

export async function sendMessage(channelId: string, body: string, mentions: MentionInput[] = []) {
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

// ─── 엔티티 멘션 검색 (켜진 모듈의 레코드만 — 비전 핵심) ───

export async function getMentionCandidates(query: string): Promise<MentionInput[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  if (process.env.PREVIEW_MODE === 'true') return [];

  const supabase = await createClient();
  const enabled = await getEnabledModules();
  const results: MentionInput[] = [];

  // partners 모듈 → 거래처
  if (enabled.includes('partners')) {
    const { data } = await supabase.from('companies').select('id, name').ilike('name', `%${q}%`).limit(5);
    for (const c of data ?? []) results.push({ entity_type: 'company', entity_id: c.id, label: c.name });
  }
  // crm_pipeline 모듈 → 딜
  if (enabled.includes('crm_pipeline')) {
    const { data } = await supabase.from('deals').select('id, title').ilike('title', `%${q}%`).limit(5);
    for (const d of data ?? []) results.push({ entity_type: 'deal', entity_id: d.id, label: d.title });
  }
  // products 모듈 → 제품
  if (enabled.includes('products')) {
    const { data } = await supabase.from('products').select('id, name').ilike('name', `%${q}%`).limit(5);
    for (const p of data ?? []) results.push({ entity_type: 'product', entity_id: p.id, label: p.name });
  }
  // orders 모듈 → 수주
  if (enabled.includes('orders')) {
    const { data } = await supabase.from('orders').select('id, order_number').ilike('order_number', `%${q}%`).limit(5);
    for (const o of data ?? []) results.push({ entity_type: 'order', entity_id: o.id, label: o.order_number ?? o.id.slice(0, 8) });
  }

  return results.slice(0, 12);
}
