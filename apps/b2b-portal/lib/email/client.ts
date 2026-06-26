/* ===== client.ts ===== */
/* Resend 클라이언트 초기화 */
/* provider 교체 시 이 파일만 수정하면 됩니다 */

import { Resend } from 'resend';

/* -- 환경 변수 검증 -- */
function getApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      '[resend-email-lib] RESEND_API_KEY 환경 변수가 설정되지 않았습니다.\n' +
      '  1. .env.example 을 .env 로 복사하세요: cp .env.example .env\n' +
      '  2. RESEND_API_KEY 값을 입력하세요 (https://resend.com → API Keys)',
    );
  }
  return key;
}

/* -- 클라이언트 싱글톤 -- */
let _client: Resend | null = null;

export function getResendClient(): Resend {
  if (!_client) {
    _client = new Resend(getApiKey());
  }
  return _client;
}

/* -- 기본 발신자 이메일 -- */
export function getDefaultFrom(): string {
  return process.env.EMAIL_FROM ?? 'onboarding@resend.dev';
}

/* -- 브랜드명 -- */
export function getDefaultBrandName(): string {
  return process.env.EMAIL_BRAND_NAME ?? 'My Service';
}
