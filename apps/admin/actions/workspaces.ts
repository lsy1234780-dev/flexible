'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// 멀티테넌시 Phase 2 — 신규 워크스페이스(테넌트) 가입 흐름
//
// 셀프서비스 SaaS 가입의 진입점: 회사 1개 = workspace 1개를 만들고,
// 가입자를 owner 멤버로 등록 + 기본 모듈 세트를 시드한다.
// (SI 전용DB 고객은 기존 /new-customer 흐름이 workspace 1행짜리로 같은 코드와 호환)

// 신규 워크스페이스 기본 모듈 세트 (053 시드와 동일 정책: 코어 ON / 미구현·상위플랜 OFF)
const DEFAULT_MODULES: { key: string; enabled: boolean }[] = [
  { key: 'platform', enabled: true },
  { key: 'partners', enabled: true },
  { key: 'products', enabled: true },
  { key: 'quotations', enabled: true },
  { key: 'orders', enabled: true },
  { key: 'inventory', enabled: true },
  { key: 'serials', enabled: true },
  { key: 'receiving', enabled: true },
  { key: 'purchasing', enabled: true },
  { key: 'supply', enabled: true },
  { key: 'fulfillment', enabled: true },
  { key: 'service', enabled: true },
  { key: 'crm_basic', enabled: true },
  { key: 'analytics', enabled: true },
  { key: 'b2b_portal', enabled: true },
  { key: 'crm_pipeline', enabled: false },
  { key: 'chat', enabled: false },
  { key: 'ecommerce', enabled: false },
  { key: 'pos', enabled: false },
  { key: 'warranty', enabled: false },
];

const RegisterSchema = z.object({
  companyName: z.string().min(1, '회사명을 입력하세요'),
  slug: z
    .string()
    .min(2, 'slug는 2자 이상이어야 합니다')
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'slug는 영소문자/숫자/하이픈만 가능합니다'),
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
});

export async function registerWorkspace(input: {
  companyName: string;
  slug: string;
  email: string;
  password: string;
}) {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { companyName, slug, email, password } = parsed.data;

  const admin = createAdminClient();

  // 1) slug 선점 확인
  const { data: existing } = await admin
    .from('workspaces')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return { error: '이미 사용 중인 주소(slug)입니다.' };
  }

  // 2) 가입자 auth 유저 생성 (이메일 확인 생략 — 셀프가입 즉시 활성)
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !userData.user) {
    return { error: userErr?.message ?? '계정 생성에 실패했습니다.' };
  }
  const userId = userData.user.id;

  // 3) 워크스페이스 생성
  const { data: ws, error: wsErr } = await admin
    .from('workspaces')
    .insert({ name: companyName, slug, plan: 'basic', status: 'active' })
    .select('id')
    .single();
  if (wsErr || !ws) {
    // 보상: 만들어둔 유저 정리
    await admin.auth.admin.deleteUser(userId);
    return { error: wsErr?.message ?? '워크스페이스 생성에 실패했습니다.' };
  }
  const workspaceId = ws.id as string;

  // 4) owner 멤버십 등록
  const { error: memErr } = await admin
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' });
  if (memErr) {
    await admin.from('workspaces').delete().eq('id', workspaceId);
    await admin.auth.admin.deleteUser(userId);
    return { error: memErr.message };
  }

  // 5) 기본 모듈 시드
  const { error: modErr } = await admin.from('workspace_modules').insert(
    DEFAULT_MODULES.map((m) => ({
      workspace_id: workspaceId,
      module_key: m.key,
      enabled: m.enabled,
    })),
  );
  if (modErr) {
    return { error: modErr.message };
  }

  return { success: true, workspaceId, slug };
}

const OnboardSchema = z.object({
  companyName: z.string().min(1, '회사명을 입력하세요'),
  slug: z
    .string()
    .min(2, 'slug는 2자 이상이어야 합니다')
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'slug는 영소문자/숫자/하이픈만 가능합니다'),
});

// 구글 OAuth로 이미 인증된 유저가 자기 워크스페이스를 생성(온보딩).
// registerWorkspace와 달리 auth 유저를 새로 만들지 않고 현재 세션 유저를 owner로 등록.
export async function createWorkspaceForCurrentUser(input: { companyName: string; slug: string }) {
  const parsed = OnboardSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { companyName, slug } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const admin = createAdminClient();

  // 이미 워크스페이스에 속해 있으면 중복 생성 방지
  const { data: existingMembership } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (existingMembership) {
    return { success: true, workspaceId: existingMembership.workspace_id };
  }

  // slug 선점 확인
  const { data: existing } = await admin
    .from('workspaces')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return { error: '이미 사용 중인 주소(slug)입니다.' };
  }

  // 워크스페이스 생성
  const { data: ws, error: wsErr } = await admin
    .from('workspaces')
    .insert({ name: companyName, slug, plan: 'basic', status: 'active' })
    .select('id')
    .single();
  if (wsErr || !ws) {
    return { error: wsErr?.message ?? '워크스페이스 생성에 실패했습니다.' };
  }
  const workspaceId = ws.id as string;

  // owner 멤버십
  const { error: memErr } = await admin
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: user.id, role: 'owner' });
  if (memErr) {
    await admin.from('workspaces').delete().eq('id', workspaceId);
    return { error: memErr.message };
  }

  // 기본 모듈 시드
  const { error: modErr } = await admin.from('workspace_modules').insert(
    DEFAULT_MODULES.map((m) => ({
      workspace_id: workspaceId,
      module_key: m.key,
      enabled: m.enabled,
    })),
  );
  if (modErr) return { error: modErr.message };

  return { success: true, workspaceId };
}
