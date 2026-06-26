import type { IssuerInfo } from './pdf/types';

// 우리 회사 정보 — .env.local 에서 읽어옴
// 없으면 기본값 사용
export function getIssuerInfo(): IssuerInfo {
  return {
    name:           process.env.ISSUER_NAME            ?? '(주)OO산업',
    businessNumber: process.env.ISSUER_BUSINESS_NUMBER ?? '',
    ceo:            process.env.ISSUER_CEO             ?? '',
    address:        process.env.ISSUER_ADDRESS         ?? '',
    phone:          process.env.ISSUER_PHONE           ?? '',
    email:          process.env.ISSUER_EMAIL           ?? '',
  };
}
