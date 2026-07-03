import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

// 멀티테넌시 Phase 2 — 현재 로그인 유저의 워크스페이스 컨텍스트
//
// 역할: service-role(RLS 우회) 쓰기 시 workspace_id를 빠뜨리면 격리가 뚫린다.
//       모든 INSERT는 이 헬퍼로 얻은 workspace_id를 명시적으로 넣어야 한다.
//       (DB 055에서 workspace_id NOT NULL이라, 누락 시 INSERT가 실패해 유출 대신 에러로 막힘.)
//
// 읽기(SELECT)는 createClient()(유저 세션 + RLS)가 자동 격리하므로 별도 주입 불필요.

// 한 요청 내 중복 쿼리 방지 (React 요청 스코프 캐시)
export const getCurrentWorkspaceId = cache(async (): Promise<string> => {
  // 미리보기 모드: 기본 워크스페이스로 고정
  if (process.env.PREVIEW_MODE === 'true') {
    return 'a0000000-0000-4000-8000-000000000001';
  }

  const supabase = await createClient();
  // getUser() 대신 getClaims(): 이 함수는 요청마다 캐시되어 매우 자주 호출됨(cache()).
  // user.id만 필요하고 RBAC 프레시니스는 무관하므로 네트워크 왕복 없는 로컬 검증이 이득.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) throw new Error('Unauthorized');
  const user = { id: claimsData.claims.sub };

  // workspace_members.self_read 정책으로 본인 멤버십은 조회 가능
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error('소속된 워크스페이스가 없습니다. 관리자에게 문의하세요.');
  }

  return data.workspace_id;
});

// INSERT payload에 workspace_id를 합쳐주는 헬퍼.
// 사용 예: await supabase.from('products').insert(await withWorkspace(parsed.data))
export async function withWorkspace<T extends Record<string, unknown>>(
  row: T,
): Promise<T & { workspace_id: string }> {
  const workspace_id = await getCurrentWorkspaceId();
  return { ...row, workspace_id };
}
