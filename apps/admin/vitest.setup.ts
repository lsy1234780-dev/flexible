// .env.local의 공개 환경변수(NEXT_PUBLIC_*)를 process.env로 로드한다.
// 통합 테스트가 Supabase URL/anon 키로 실제 인증 스택을 태우기 위함. (없으면 통합 테스트는 스킵)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

try {
  const raw = readFileSync(resolve(__dirname, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, val] = m;
    if (process.env[key] === undefined) process.env[key] = val.trim();
  }
} catch {
  // .env.local이 없는 환경(CI 등) — 통합 테스트는 skipIf로 알아서 빠진다
}
