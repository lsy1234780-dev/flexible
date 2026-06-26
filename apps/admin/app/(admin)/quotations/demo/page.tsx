import NewQuotationClient from '../new/NewQuotationClient';

const DEMO_COMPANIES = [
  { id: 'demo-company-1', name: 'AA유통', is_supplier: false, is_customer: true, status: 'active', created_at: '' },
  { id: 'demo-company-2', name: 'BB전자', is_supplier: false, is_customer: true, status: 'active', created_at: '' },
];

const DEMO_PRODUCTS = [
  { id: 'demo-product-1', name: '무선 바코드 스캐너 BT-100', barcode: '8801234000001', base_price: 85000, base_stock: 50, is_visible_default: true, created_at: '' },
  { id: 'demo-product-2', name: '산업용 PDA 단말기 P-200', barcode: '8801234000002', base_price: 320000, base_stock: 20, is_visible_default: true, created_at: '' },
  { id: 'demo-product-3', name: '고정식 바코드 리더 F-300', barcode: '8801234000003', base_price: 150000, base_stock: 30, is_visible_default: true, created_at: '' },
  { id: 'demo-product-4', name: '라벨 프린터 LP-400', barcode: '8801234000004', base_price: 210000, base_stock: 15, is_visible_default: true, created_at: '' },
  { id: 'demo-product-5', name: '2D QR 스캐너 Q-500', barcode: '8801234000005', base_price: 95000, base_stock: 40, is_visible_default: true, created_at: '' },
];

export default function QuotationDemoPage() {
  return (
    <div className="relative">
      {/* 데모 모드 배너 */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-700 text-center">
        데모 모드 — 실제 저장·이메일 발송은 동작하지 않습니다
      </div>
      <NewQuotationClient
        companies={DEMO_COMPANIES as unknown as Parameters<typeof NewQuotationClient>[0]['companies']}
        products={DEMO_PRODUCTS as unknown as Parameters<typeof NewQuotationClient>[0]['products']}
        demoMode
      />
    </div>
  );
}
