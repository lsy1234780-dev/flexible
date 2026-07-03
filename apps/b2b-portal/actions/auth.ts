'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { sendMagicLink } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const BRAND_NAME = process.env.EMAIL_BRAND_NAME ?? 'B2B 협력사 포털';

// 기존 계정 로그인 — Admin API로 링크 생성 후 email-lib으로 직접 발송
export async function sendLoginLink(formData: FormData) {
  const email = String(formData.get('email'));
  const serviceClient = createServiceClient();

  const { data: generated, error } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${APP_URL}/auth/callback` },
  });

  if (error || !generated?.properties?.action_link) {
    // 존재하지 않는 계정도 프론트에는 성공처럼 보임 (이메일 열거 방지)
    return { success: true };
  }

  const result = await sendMagicLink({
    to: email,
    magicUrl: generated.properties.action_link,
    userEmail: email,
    brandName: BRAND_NAME,
  });

  if (!result.success) return { error: result.error ?? '이메일 발송에 실패했습니다' };
  return { success: true };
}

// 신규 가입 신청 — Admin API로 사용자 생성 + magic link 발송
export async function sendRegisterLink(formData: FormData) {
  const email = String(formData.get('email'));
  const companyName = String(formData.get('company_name')).trim();
  if (!companyName) return { error: '업체명을 입력해주세요' };

  const serviceClient = createServiceClient();

  // 사용자 생성 — 중복이면 Supabase가 에러 반환
  const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { company_name: companyName },
  });

  if (createErr) {
    const isDuplicate = createErr.message.toLowerCase().includes('already') ||
      createErr.message.toLowerCase().includes('registered');
    return { error: isDuplicate ? '이미 가입된 이메일입니다. 로그인 링크를 요청해주세요.' : createErr.message };
  }
  if (!created.user) {
    return { error: '가입 처리 중 오류가 발생했습니다' };
  }

  // magic link 생성
  const { data: generated, error: linkErr } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${APP_URL}/auth/callback` },
  });

  if (linkErr || !generated?.properties?.action_link) {
    return { error: '링크 생성 중 오류가 발생했습니다' };
  }

  const result = await sendMagicLink({
    to: email,
    magicUrl: generated.properties.action_link,
    userEmail: email,
    brandName: BRAND_NAME,
  });

  if (!result.success) return { error: result.error ?? '이메일 발송에 실패했습니다' };
  return { success: true };
}

// 로그인 콜백에서 호출 — 신규 가입이면 company 생성, 기존이면 무시
// companies.workspace_id는 NOT NULL(055) — 이 포털이 속한 워크스페이스는 env로 지정한다.
export async function ensureCompany() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return;

  const serviceClient = createServiceClient();
  const { data: existing } = await serviceClient
    .from('companies')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!existing) {
    const companyName = user.user_metadata?.company_name as string | undefined;
    const workspaceId = process.env.B2B_WORKSPACE_ID;
    if (!workspaceId) {
      console.error('[ensureCompany] B2B_WORKSPACE_ID 환경변수가 없어 업체를 생성할 수 없습니다');
      return;
    }
    if (companyName) {
      const { error } = await serviceClient.from('companies').insert({
        name: companyName,
        is_customer: true,
        status: 'pending',
        auth_user_id: user.id,
        workspace_id: workspaceId,
      });
      if (error) console.error('[ensureCompany] 업체 생성 실패:', error.message);
    }
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
