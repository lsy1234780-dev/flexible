// 발행사 정보
export interface IssuerInfo {
  name: string;               // 회사명
  businessNumber?: string;    // 사업자등록번호 (예: 000-00-00000)
  ceo?: string;               // 대표자명
  address?: string;           // 주소
  phone?: string;             // 전화번호
  email?: string;             // 이메일
}

// 수신 업체 정보
export interface CompanyInfo {
  name: string;               // 업체명
  businessNumber?: string;    // 사업자등록번호
  contact?: string;           // 담당자 연락처
  address?: string;           // 업체 주소
}

// 견적 항목
export interface QuotationItem {
  productName: string;        // 제품명 (커스텀 항목은 label)
  spec?: string;              // 규격
  barcode: string;            // 품목코드 (커스텀 항목은 빈 문자열)
  unit?: string;              // 단위 (개, kg 등) — 기본값: '개'
  quantity: number;           // 수량
  unitPrice: number;          // 단가 (음수 가능: 할인 항목)
  totalPrice: number;         // 합계
  isTaxable?: boolean;        // 부가세 적용 여부 (기본: true)
  isCustom?: boolean;         // 커스텀 항목 여부 (수리비, 할인 등)
}

// 견적서 데이터
export interface QuotationData {
  quotationNumber: string;    // 견적번호 (예: Q-2025-001)
  issuedAt: Date;             // 발행일
  validUntil?: Date;          // 유효기간
  issuer: IssuerInfo;         // 발행사 정보
  company: CompanyInfo;       // 수신 업체 정보
  items: QuotationItem[];     // 견적 항목
  taxRate?: number;           // 세율 (기본값: 0.1 = 10%, 0 이면 면세)
  note?: string;              // 비고
}
