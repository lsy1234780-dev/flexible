import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 통합 테스트가 .env.local의 Supabase 공개키(URL/anon)를 쓰도록 setup에서 로드
    setupFiles: ['./vitest.setup.ts'],
    // 순수 로직은 node 환경으로 충분 (jsdom/React 불필요)
    environment: 'node',
  },
});
