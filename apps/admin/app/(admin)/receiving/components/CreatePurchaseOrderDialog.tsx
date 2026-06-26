'use client';

import { useState, useTransition } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPurchaseOrder } from '@/actions/purchaseOrders';
import { getCountryByCode } from '@/lib/countries';
import { toast } from 'sonner';

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  country: string | null;
}

interface Props {
  open: boolean;
  suppliers: Supplier[];
  onClose: () => void;
  onCreated: () => void;
}

export default function CreatePurchaseOrderDialog({ open, suppliers, onClose, onCreated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierManual, setSupplierManual] = useState('');
  const [currency, setCurrency] = useState('KRW');
  const [memo, setMemo] = useState('');

  function reset() {
    setTitle('');
    setPoNumber('');
    setSupplierId('');
    setSupplierManual('');
    setCurrency('KRW');
    setMemo('');
  }

  function handleSupplierChange(id: string) {
    setSupplierId(id);
    if (id) {
      const s = suppliers.find((s) => s.id === id);
      setSupplierManual(s?.name ?? '');
      const country = s?.country ? getCountryByCode(s.country) : null;
      setCurrency(country?.currency ?? 'KRW');
    } else {
      setSupplierManual('');
      setCurrency('KRW');
    }
  }

  function handleSubmit() {
    if (!title.trim()) { toast.error('제목을 입력하세요'); return; }

    startTransition(async () => {
      const res = await createPurchaseOrder({
        title: title.trim(),
        po_number: poNumber || undefined,
        supplier_id: supplierId || undefined,
        supplier: supplierManual || undefined,
        currency: currency || undefined,
        memo: memo || undefined,
      });

      if (res.error) { toast.error(res.error); return; }
      toast.success('발주 등록 완료');
      reset();
      onClose();
      onCreated();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 발주 등록</DialogTitle>
          <DialogDescription className="sr-only">발주 정보 입력</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 제목 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">제목 *</label>
            <Input
              placeholder="예: 3월 2차 해외 발주"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* PO번호 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">PO 번호</label>
            <Input
              placeholder="PO-2026-001"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
            />
          </div>

          {/* 공급처명 + 공급처 셀렉터 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">공급처명</label>
              <Input
                placeholder="공급업체명"
                value={supplierManual}
                onChange={(e) => setSupplierManual(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">공급처 선택</label>
              <select
                value={supplierId}
                onChange={(e) => handleSupplierChange(e.target.value)}
                className="w-full h-9 rounded-md border px-2 text-sm"
              >
                <option value="">직접 입력</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 통화 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">통화</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full h-9 rounded-md border px-2 text-sm"
            >
              <option value="KRW">KRW (원)</option>
              <option value="USD">USD ($)</option>
              <option value="CNY">CNY (¥)</option>
              <option value="EUR">EUR (€)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>

          {/* 메모 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">메모</label>
            <textarea
              placeholder="메모 (선택)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? '등록 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
