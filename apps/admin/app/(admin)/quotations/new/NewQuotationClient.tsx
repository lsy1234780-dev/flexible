'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeft, Eye, Save, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createQuotation } from '@/actions/quotations';
import { getCompanyProductPrices } from '@/actions/companies';
import type { Company, Product } from '@/types/database';

interface Props {
  companies: Company[];
  products: Product[];
  demoMode?: boolean;
}

interface DeviceItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  is_taxable: boolean;
}

interface OptionItem {
  label: string;
  quantity: number;
  unit_price: number;
  is_taxable: boolean;
}

const EMPTY_DEVICE: DeviceItem = { product_id: '', quantity: 1, unit_price: 0, is_taxable: true };
const EMPTY_OPTION: OptionItem = { label: '', quantity: 1, unit_price: 0, is_taxable: true };

export default function NewQuotationClient({ companies, products, demoMode = false }: Props) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState('');
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [deviceItems, setDeviceItems] = useState<DeviceItem[]>([{ ...EMPTY_DEVICE }]);
  const [optionItems, setOptionItems] = useState<OptionItem[]>([]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleCompanyChange(id: string) {
    setCompanyId(id);
    setDeviceItems([{ ...EMPTY_DEVICE }]);
    setOptionItems([]);
    setPreviewUrl(null);

    if (!id) { setPriceMap({}); return; }

    if (demoMode) {
      // 데모 모드: 제품 base_price를 단가 맵으로 사용
      const map: Record<string, number> = {};
      products.forEach((p) => { map[p.id] = p.base_price; });
      setPriceMap(map);
      return;
    }

    setLoadingPrices(true);
    try {
      const map = await getCompanyProductPrices(id);
      setPriceMap(map);
    } catch {
      toast.error('업체 단가를 불러오지 못했습니다');
      setPriceMap({});
    } finally {
      setLoadingPrices(false);
    }
  }

  function getEffectivePrice(productId: string): number {
    return priceMap[productId] ?? products.find((p) => p.id === productId)?.base_price ?? 0;
  }

  // ── 제품 항목 ──────────────────────────────────
  function addDevice() {
    setDeviceItems((prev) => [...prev, { ...EMPTY_DEVICE }]);
    setPreviewUrl(null);
  }

  function removeDevice(index: number) {
    setDeviceItems((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrl(null);
  }

  function updateDevice(index: number, field: keyof DeviceItem, value: string | number) {
    setDeviceItems((prev) => {
      const next = [...prev];
      if (field === 'product_id') {
        const pid = String(value);
        next[index] = { ...next[index], product_id: pid, unit_price: getEffectivePrice(pid) };
      } else if (field === 'is_taxable') {
        next[index] = { ...next[index], is_taxable: !!value };
      } else {
        next[index] = { ...next[index], [field]: Number(value) };
      }
      return next;
    });
    setPreviewUrl(null);
  }

  // ── 옵션 항목 ──────────────────────────────────
  function addOption() {
    setOptionItems((prev) => [...prev, { ...EMPTY_OPTION }]);
    setPreviewUrl(null);
  }

  function removeOption(index: number) {
    setOptionItems((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrl(null);
  }

  function updateOption(index: number, field: keyof OptionItem, value: string | number) {
    setOptionItems((prev) => {
      const next = [...prev];
      if (field === 'is_taxable') {
        next[index] = { ...next[index], is_taxable: !!value };
      } else {
        next[index] = { ...next[index], [field]: field === 'label' ? String(value) : Number(value) };
      }
      return next;
    });
    setPreviewUrl(null);
  }

  // ── 금액 계산 ──────────────────────────────────
  const deviceTotal = deviceItems.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const optionTotal = optionItems.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const subtotal = deviceTotal + optionTotal;
  const taxableTotal = [
    ...deviceItems.filter((i) => i.is_taxable),
    ...optionItems.filter((i) => i.is_taxable),
  ].reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const tax = Math.floor(taxableTotal * 0.1);

  function validate(): boolean {
    if (!companyId) { toast.error('업체를 선택하세요'); return false; }
    if (deviceItems.length === 0) { toast.error('제품 항목을 최소 1개 추가하세요'); return false; }
    if (deviceItems.some((i) => !i.product_id)) { toast.error('제품를 모두 선택하세요'); return false; }
    if (optionItems.some((i) => !i.label.trim())) { toast.error('옵션 항목명을 모두 입력하세요'); return false; }
    return true;
  }

  function buildAllItems() {
    return [
      ...deviceItems.map((i) => ({ product_id: i.product_id, label: null as string | null, quantity: i.quantity, unit_price: i.unit_price, is_taxable: i.is_taxable })),
      ...optionItems.map((i) => ({ product_id: null as string | null, label: i.label, quantity: i.quantity, unit_price: i.unit_price, is_taxable: i.is_taxable })),
    ];
  }

  async function handlePreview() {
    if (!validate()) return;
    const company = companies.find((c) => c.id === companyId);
    if (!company) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setLoadingPreview(true);

    try {
      const res = await fetch('/api/quotations/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, companyName: company.name, items: buildAllItems() }),
      });
      if (!res.ok) { toast.error('미리보기 생성 실패'); return; }
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      toast.error('미리보기 생성 중 오류가 발생했습니다');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleSave() {
    if (demoMode) { toast.info('데모 모드에서는 저장할 수 없습니다'); return; }
    if (!validate()) return;
    setIsSaving(true);
    try {
      const result = await createQuotation(companyId, buildAllItems());
      if (result.error) { toast.error(result.error); return; }
      toast.success(`견적서 ${result.number} 저장됨`);
      router.push('/quotations');
    } finally {
      setIsSaving(false);
    }
  }

  function handleDownload() {
    if (!previewUrl) return;
    const company = companies.find((c) => c.id === companyId);
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `견적서_${company?.name ?? ''}_미리보기.pdf`;
    a.click();
  }

  function handlePrint() {
    const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement | null;
    iframe?.contentWindow?.print();
  }

  const visibleProducts = companyId
    ? products.filter((p) => priceMap[p.id] !== undefined)
    : products;

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* ── 왼쪽: 입력 폼 ─────────────────────────── */}
      <div className="w-1/2 overflow-y-auto p-4 space-y-4 border-r">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/quotations')}>
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-xl font-bold">견적서 작성</h1>
        </div>

        {/* 업체 선택 */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">수신 업체</CardTitle></CardHeader>
          <CardContent>
            <Select value={companyId} onValueChange={handleCompanyChange}>
              <SelectTrigger><SelectValue placeholder="업체 선택" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* 제품 항목 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">제품</CardTitle>
              <Button variant="outline" size="sm" onClick={addDevice} disabled={!companyId || loadingPrices}>
                <Plus size={14} /> 제품 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId && (
              <p className="text-sm text-gray-400 text-center py-4">업체를 먼저 선택하세요</p>
            )}
            {loadingPrices && (
              <p className="text-sm text-gray-400 text-center py-4">단가 불러오는 중...</p>
            )}
            {companyId && !loadingPrices && deviceItems.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4 space-y-1">
                  {index === 0 && <Label className="text-xs">제품</Label>}
                  <Select value={item.product_id} onValueChange={(v) => updateDevice(index, 'product_id', v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="제품 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 space-y-1">
                  {index === 0 && <Label className="text-xs">수량</Label>}
                  <Input
                    type="number" min={1}
                    value={item.quantity}
                    onChange={(e) => updateDevice(index, 'quantity', e.target.value)}
                    className="h-9 text-right"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  {index === 0 && <Label className="text-xs text-blue-500">단가</Label>}
                  <Input
                    type="number" min={0}
                    value={item.unit_price}
                    onChange={(e) => updateDevice(index, 'unit_price', e.target.value)}
                    className="h-9 text-right"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  {index === 0 && <Label className="text-xs">소계</Label>}
                  <p className="h-9 flex items-center justify-end text-sm font-medium">
                    ₩{(item.quantity * item.unit_price).toLocaleString()}
                  </p>
                </div>
                <div className="col-span-2 space-y-1">
                  {index === 0 && <Label className="text-xs">과세액</Label>}
                  <button
                    type="button"
                    onClick={() => updateDevice(index, 'is_taxable', item.is_taxable ? 0 : 1)}
                    className={`h-9 w-full flex items-center justify-end text-sm cursor-pointer hover:opacity-70 ${item.is_taxable ? 'text-gray-700' : 'text-gray-400'}`}
                  >
                    {item.is_taxable ? `₩${Math.floor(item.quantity * item.unit_price * 0.1).toLocaleString()}` : '비과세'}
                  </button>
                </div>
                <div className="col-span-1">
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => removeDevice(index)}
                    disabled={deviceItems.length === 1}
                    className="h-9 w-9 text-red-500"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
            {companyId && !loadingPrices && (
              <div className="flex justify-end pt-2 border-t text-sm text-gray-500">
                제품 소계: <span className="ml-2 font-semibold text-gray-700">₩{deviceTotal.toLocaleString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 옵션 항목 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">옵션</CardTitle>
              <Button variant="outline" size="sm" onClick={addOption} disabled={!companyId || loadingPrices}>
                <Plus size={14} /> 옵션 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId && (
              <p className="text-sm text-gray-400 text-center py-2">업체를 먼저 선택하세요</p>
            )}
            {companyId && optionItems.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">옵션 없음 — 옵션 추가 버튼으로 추가하세요</p>
            )}
            {companyId && optionItems.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4 space-y-1">
                  {index === 0 && <Label className="text-xs">옵션명</Label>}
                  <Input
                    placeholder="예: 설치비, 케이블, 보증 연장"
                    value={item.label}
                    onChange={(e) => updateOption(index, 'label', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="col-span-1 space-y-1">
                  {index === 0 && <Label className="text-xs">수량</Label>}
                  <Input
                    type="number" min={1}
                    value={item.quantity}
                    onChange={(e) => updateOption(index, 'quantity', e.target.value)}
                    className="h-9 text-right"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  {index === 0 && <Label className="text-xs">단가</Label>}
                  <Input
                    type="number" min={0}
                    value={item.unit_price}
                    onChange={(e) => updateOption(index, 'unit_price', e.target.value)}
                    className="h-9 text-right"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  {index === 0 && <Label className="text-xs">소계</Label>}
                  <p className="h-9 flex items-center justify-end text-sm font-medium">
                    ₩{(item.quantity * item.unit_price).toLocaleString()}
                  </p>
                </div>
                <div className="col-span-2 space-y-1">
                  {index === 0 && <Label className="text-xs">과세액</Label>}
                  <button
                    type="button"
                    onClick={() => updateOption(index, 'is_taxable', item.is_taxable ? 0 : 1)}
                    className={`h-9 w-full flex items-center justify-end text-sm cursor-pointer hover:opacity-70 ${item.is_taxable ? 'text-gray-700' : 'text-gray-400'}`}
                  >
                    {item.is_taxable ? `₩${Math.floor(item.quantity * item.unit_price * 0.1).toLocaleString()}` : '비과세'}
                  </button>
                </div>
                <div className="col-span-1">
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => removeOption(index)}
                    className="h-9 w-9 text-red-500"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
            {companyId && optionItems.length > 0 && (
              <div className="flex justify-end pt-2 border-t text-sm text-gray-500">
                옵션 소계: <span className="ml-2 font-semibold text-gray-700">₩{optionTotal.toLocaleString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 합계 */}
        {companyId && !loadingPrices && (
          <Card>
            <CardContent className="pt-4 pb-4 space-y-1">
              <div className="flex justify-between text-sm text-gray-500">
                <span>제품 합계</span><span>₩{deviceTotal.toLocaleString()}</span>
              </div>
              {optionItems.length > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>옵션 합계</span><span>₩{optionTotal.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-gray-500">
                <span>공급가액</span><span>₩{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>과세 대상</span><span>₩{taxableTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>부가세 (10%)</span><span>₩{tax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-1 border-t">
                <span>합계</span><span>₩{(subtotal + tax).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant="outline"
            onClick={handlePreview}
            disabled={!companyId || loadingPrices || loadingPreview}
          >
            <Eye size={16} />
            {loadingPreview ? '생성 중...' : '미리보기'}
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={isSaving || !companyId || loadingPrices}
          >
            <Save size={16} />
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>

      {/* ── 오른쪽: PDF 미리보기 ─────────────────── */}
      <div className="w-1/2 flex flex-col bg-gray-100">
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
          <span className="text-sm font-medium text-gray-600">PDF 미리보기</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={!previewUrl} className="h-8 text-xs">
              <Download size={13} /> 다운로드
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!previewUrl} className="h-8 text-xs">
              <Printer size={13} /> 인쇄
            </Button>
          </div>
        </div>

        <div className="flex-1 relative">
          {loadingPreview && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <p className="text-sm text-gray-400">PDF 생성 중...</p>
            </div>
          )}
          {!loadingPreview && !previewUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Eye size={40} strokeWidth={1} />
              <p className="text-sm">항목 입력 후 미리보기를 눌러주세요</p>
            </div>
          )}
          {previewUrl && (
            <iframe
              id="preview-iframe"
              src={previewUrl}
              className="w-full h-full border-0"
              title="견적서 미리보기"
            />
          )}
        </div>
      </div>
    </div>
  );
}
