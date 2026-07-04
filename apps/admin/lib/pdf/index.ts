// 견적서 생성 함수
export { generateQuotation, generateQuotationBuffer } from './generate/generateQuotation';

// 경비 지급 내역서
export { generateExpenseStatementBuffer } from './generate/generateExpenseStatement';
export type { ExpenseStatementData } from './generate/generateExpenseStatement';

// 타입 export
export type { QuotationData, QuotationItem, IssuerInfo, CompanyInfo } from './types';
