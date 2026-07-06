import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 통합 테스트 — 경비 레코드 스레드 프라이버시(마이그레이션 091)를 실제 인증 스택으로 검증.
// 배포된 record_thread_visible() 게이트를 "소유자 / 무관 계정" 각각의 세션으로 호출해,
// 개인정보(경비)는 소유자만·업무 레코드(수주)는 전원이 보이는지 확인한다.
//
// 실행 조건: .env.local에 Supabase URL/anon 키 + 아래 테스트 계정 로그인이 가능해야 한다.
//   - 소유자:   lsy1234780@gmail.com / test1234
//   - 무관 계정: outside@flexible.test / test1234
// 없으면(예: CI) 전체 스킵.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OWNER = { email: 'lsy1234780@gmail.com', password: 'test1234' };
const OUTSIDER = { email: 'outside@flexible.test', password: 'test1234' };

const canRun = !!url && !!anon;

function client(): SupabaseClient {
  return createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(creds: { email: string; password: string }): Promise<SupabaseClient> {
  const c = client();
  const { error } = await c.auth.signInWithPassword(creds);
  if (error) throw new Error(`sign-in 실패(${creds.email}): ${error.message}`);
  return c;
}

describe.skipIf(!canRun)('경비 레코드 스레드 프라이버시 (RLS, 마이그레이션 091)', () => {
  let owner: SupabaseClient;
  let outsider: SupabaseClient;
  let claimId: string;
  let workspaceId: string;

  beforeAll(async () => {
    owner = await signIn(OWNER);
    outsider = await signIn(OUTSIDER);

    // 소유자가 자기 워크스페이스에 draft 경비 1건을 만들어 테스트 픽스처로 쓴다
    const { data: ws } = await owner.rpc('current_workspace_ids');
    workspaceId = (ws as string[])[0];
    const { data: uid } = await owner.auth.getUser();
    const { data: claim, error } = await owner
      .from('expense_claims')
      .insert({ workspace_id: workspaceId, user_id: uid.user!.id, title: '[TEST] privacy', status: 'draft' })
      .select('id')
      .single();
    if (error) throw new Error(`픽스처 생성 실패: ${error.message}`);
    claimId = claim.id;
  }, 30_000);

  afterAll(async () => {
    // 픽스처 정리 (소유자는 자기 draft를 삭제 가능)
    if (claimId) await owner.from('expense_claims').delete().eq('id', claimId);
  });

  it('소유자는 자기 경비 스레드를 볼 수 있다', async () => {
    const { data, error } = await owner.rpc('record_thread_visible', { p_type: 'expense', p_id: claimId });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('무관 계정은 남의 경비 스레드를 볼 수 없다', async () => {
    const { data, error } = await outsider.rpc('record_thread_visible', { p_type: 'expense', p_id: claimId });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it('업무 레코드(수주) 스레드는 무관 계정도 볼 수 있다 (공개 유지)', async () => {
    const { data, error } = await outsider.rpc('record_thread_visible', {
      p_type: 'order',
      p_id: '00000000-0000-4000-8000-000000000000',
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('무관 계정은 남의 경비 헤더 자체도 RLS로 못 읽는다', async () => {
    const { data } = await outsider.from('expense_claims').select('id').eq('id', claimId);
    expect(data ?? []).toHaveLength(0);
  });
});
