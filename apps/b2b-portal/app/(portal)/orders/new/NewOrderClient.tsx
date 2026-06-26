'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createOrder } from '@/actions/orders';

interface Product { id: string; name: string; barcode: string; price: number; stock: number; }
interface Company { id: string; name: string; }
interface Props { company: Company; products: Product[]; initialProductId?: string; }
interface LineItem { product_id: string; quantity: number; unit_price: number; }

const EMPTY: LineItem = { product_id: '', quantity: 1, unit_price: 0 };

export default function NewOrderClient({ company, products, initialProductId }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<LineItem[]>(() => {
    if (initialProductId) {
      const p = products.find((x) => x.id === initialProductId);
      if (p) return [{ product_id: p.id, quantity: 1, unit_price: p.price }];
    }
    return [{ ...EMPTY }];
  });
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => {
      const next = [...prev];
      if (field === 'product_id') {
        const p = products.find((x) => x.id === value);
        next[index] = { ...next[index], product_id: String(value), unit_price: p?.price ?? 0 };
      } else {
        next[index] = { ...next[index], [field]: Number(value) };
      }
      return next;
    });
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const tax = Math.floor(total * 0.1);

  async function handleSubmit() {
    if (items.some((i) => !i.product_id)) { toast.error('제품을 모두 선택하세요'); return; }
    if (items.some((i) => i.quantity < 1)) { toast.error('수량을 확인하세요'); return; }

    // 재고 초과 체크
    for (const item of items) {
      const p = products.find((x) => x.id === item.product_id);
      if (p && item.quantity > p.stock) {
        toast.error(`${p.name}: 재고 부족 (최대 ${p.stock}개)`);
        return;
      }
    }

    setLoading(true);
    const result = await createOrder(company.id, items, notes || undefined);
    setLoading(false);

    if (result.error) { toast.error(result.error); return; }
    toast.success('발주가 접수되었습니다');
    router.push('/orders');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/orders')}>
          <ArrowLeft size={18} />
        </Button>
        <h1 className="text-xl font-bold">발주 생성</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">발주 항목</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, { ...EMPTY }])}>
              <Plus size={14} /> 항목 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 헤더 라벨 */}
          {items.length > 0 && (
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6"><Label className="text-xs">제품</Label></div>
              <div className="col-span-2"><Label className="text-xs">수량</Label></div>
              <div className="col-span-3"><Label className="text-xs">소계</Label></div>
              <div className="col-span-1" />
            </div>
          )}
          {items.map((item, index) => {
            const product = products.find((p) => p.id === item.product_id);
            return (
              <div key={index} className="space-y-1">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6">
                    <Select value={item.product_id} onValueChange={(v) => { if (v) updateItem(index, 'product_id', v); }}>
                      <SelectTrigger className="h-9 w-full">
                        {product ? (
                          <span className="truncate">{product.name}</span>
                        ) : (
                          <span className="text-muted-foreground">제품 선택</span>
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id} disabled={p.stock === 0}>
                            {p.name} {p.stock === 0 ? '(품절)' : `(재고 ${p.stock})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number" min={1} max={product?.stock ?? 9999}
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="h-9 text-right"
                    />
                  </div>
                  <div className="col-span-3">
                    <p className="h-9 flex items-center justify-end text-sm font-medium">
                      ₩{(item.quantity * item.unit_price).toLocaleString()}
                    </p>
                  </div>
                  <div className="col-span-1">
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setItems((p) => p.filter((_, i) => i !== index))}
                      disabled={items.length === 1}
                      className="h-9 w-9 text-red-500"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                {product && (
                  <p className="text-xs text-gray-400 pl-0.5">
                    단가 ₩{product.price.toLocaleString()} · 최대 {product.stock}개
                  </p>
                )}
              </div>
            );
          })}

          <div className="border-t pt-3 space-y-1 text-right">
            <div className="flex justify-between text-sm text-gray-500">
              <span>공급가액</span><span>₩{total.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>부가세 (10%)</span><span>₩{tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>합계</span><span>₩{(total + tax).toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">요청사항</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="배송 관련 요청사항이나 참고사항을 입력하세요 (선택)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push('/orders')}>취소</Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? '접수 중...' : '발주 접수'}
        </Button>
      </div>
    </div>
  );
}
