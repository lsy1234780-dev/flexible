/**
 * 템플릿 레지스트리
 * 새 문서 유형을 추가할 때 이 파일에만 등록하면 어드민에 자동 반영됩니다.
 *
 * 사용처: preview-app API route (서버 전용 — fs 접근 포함)
 */
import { QuotationData } from '../types';
import { generateQuotationBuffer } from '../generate/generateQuotation';

export type TemplateCategory = 'sales' | 'purchase' | 'logistics';

export interface TemplateEntry {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** 어드민 에디터 초기값 */
  defaultData: Record<string, unknown>;
  /** API route 에서 호출 — data 는 JSON.parse 된 plain object */
  generate: (data: Record<string, unknown>) => Promise<Buffer>;
}

// ─────────────────────────────────────────────
// 견적서 기본 데이터
// ─────────────────────────────────────────────
const today = new Date();
const nextMonth = new Date(today.getTime() + 30 * 86400000);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

const DEFAULT_QUOTATION: Record<string, unknown> = {
  quotationNumber: 'Q-2026-001',
  issuedAt: fmt(today),
  validUntil: fmt(nextMonth),
  issuer: {
    name: '(주) 오케이유통',
    businessNumber: '123-45-67890',
    ceo: '홍길동',
    address: '서울특별시 강남구 테헤란로 123, 4층',
    phone: '02-1234-5678',
    email: 'sales@example.com',
  },
  company: {
    name: '거래처명',
    contact: '담당자명 (010-0000-0000)',
    address: '',
  },
  items: [
    {
      productName: '제품명 A',
      barcode: '8801234560001',
      spec: '500ml',
      unit: '개',
      quantity: 10,
      unitPrice: 15000,
      totalPrice: 150000,
    },
  ],
  taxRate: 0.1,
  note: '',
};

/** JSON plain object → QuotationData (Date 변환 처리) */
function toQuotationData(raw: Record<string, unknown>): QuotationData {
  return {
    ...(raw as unknown as QuotationData),
    issuedAt: new Date(raw.issuedAt as string),
    validUntil: raw.validUntil ? new Date(raw.validUntil as string) : undefined,
  };
}

// ─────────────────────────────────────────────
// 레지스트리 — 새 템플릿은 여기에 추가
// ─────────────────────────────────────────────
export const TEMPLATES: Record<string, TemplateEntry> = {
  quotation: {
    id: 'quotation',
    name: '견적서',
    description: '업체별 단가가 반영된 A4 견적서',
    category: 'sales',
    defaultData: DEFAULT_QUOTATION,
    generate: (raw) => generateQuotationBuffer(toQuotationData(raw)),
  },

  // 추후 추가 예시:
  // delivery: {
  //   id: 'delivery',
  //   name: '출고확인서',
  //   description: '출고된 제품의 확인서',
  //   category: 'logistics',
  //   defaultData: DEFAULT_DELIVERY,
  //   generate: (raw) => generateDeliveryBuffer(toDeliveryData(raw)),
  // },
};

export type TemplateId = keyof typeof TEMPLATES;
