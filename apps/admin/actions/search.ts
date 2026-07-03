'use server';

// 글로벌 검색 — moduleRegistry의 ENTITY_REGISTRY를 재사용해서 켜진 모듈의 레코드 전체를 한 번에 검색한다.
// @멘션 검색(getMentionCandidates, actions/chat.ts)과 같은 소스를 쓰지만, 저건 "타입 하나 골라서 그 안에서
// 검색"이고 이건 "쿼리 하나로 모든 타입을 동시에" — 그래서 별도 함수로 분리했다.

import { createClient } from '@/lib/supabase/server';
import { getEnabledModules } from '@/actions/modules';
import { entitiesForModules } from '@/lib/moduleRegistry';

export interface GlobalSearchResult {
  entityType: string;
  typeLabel: string;
  id: string;
  label: string;
  href: string;
}

export async function globalSearch(query: string): Promise<GlobalSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (process.env.PREVIEW_MODE === 'true') return [];

  const enabled = await getEnabledModules();
  // 사람(멤버)은 상세 페이지가 없어(href '#') 레코드 검색과 성격이 달라 제외 — 사람 찾기는 채팅 쪽에서.
  const defs = entitiesForModules(enabled).filter((d) => !('kind' in d.source));
  const supabase = await createClient();

  const results = await Promise.all(defs.map(async (def) => {
    const src = def.source as Extract<typeof def.source, { table: string }>;
    const cols = Array.from(new Set(['id', ...src.labelColumns, ...src.searchColumns])).join(', ');
    const { data } = await supabase
      .from(src.table as never)
      .select(cols)
      .or(src.searchColumns.map((c) => `${c}.ilike.%${q}%`).join(','))
      .limit(5);

    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row): GlobalSearchResult => {
      const id = String(row.id);
      const label = src.labelColumns.map((c) => row[c]).filter(Boolean).map(String).join(' · ');
      return {
        entityType: def.type,
        typeLabel: def.label,
        id,
        label: label || id.slice(0, 8),
        href: def.href(id),
      };
    });
  }));

  return results.flat();
}
