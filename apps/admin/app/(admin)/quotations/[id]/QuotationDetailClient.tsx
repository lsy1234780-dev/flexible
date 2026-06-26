'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Download, Save, Plus, Trash2, Send, PlusCircle, MinusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/ui/data-table';
import { updateQuotationStatus, updateQuotationItems, sendQuotationEmail } from '@/actions/quotations';
import dayjs from 'dayjs';

type QuotationStatus = 'draft' | 'sent' | 'confirmed';

interface QuotationItem {
  id: string;
  product_id: string | null;
  label: string | null;
  quantity: number;
  unit_price: number;
  is_taxable: boolean;
  products: { name: string; barcode: string } | null;
}

interface OrderRef { id: string; order_number: string | null; status: string; }

interface Quotation {
  id: string;
  number: string;
  status: QuotationStatus;
  issued_at: string;
  issued_by: string | null;
  order_id: string | null;
  company_id: string;
  companies: { id: string; name: string } | null;
  quotation_items: QuotationItem[];
  orders: OrderRef | null;
}

interface ProductRef {
  id: string;
  name: string;
  barcode: string;
  base_price: number;
}

interface Props {
  quotation: Quotation;
  products: ProductRef[];
}

// 항목 종류: product(제품), custom(기타비용), discount(할인)
type ItemType = 'product' | 'custom' | 'discount';

type DiscountMode = 'amount' | 'percent';

interface EditItem {
  key: string;
  type: ItemType;
  product_id: string | null;
  label: string;
  quantity: string;
  unit_price: string;
  is_taxable: boolean;
  discount_mode: DiscountMode;
}

// DataTable requires { id: string }
type EditItemRow = EditItem & { id: string };

const statusLabel: Record<QuotationStatus, string> = {
  draft: '초안',
  sent: '발송',
  confirmed: '확정',
};

const statusVariant: Record<QuotationStatus, 'secondary' | 'default' | 'outline'> = {
  draft: 'secondary',
  sent: 'default',
  confirmed: 'outline',
};

let keyCounter = 0;
function nextKey() { return `item-${++keyCounter}`; }

function classifyItem(item: QuotationItem): ItemType {
  if (item.product_id) return 'product';
  if (item.unit_price < 0) return 'discount';
  return 'custom';
}

function toRow(item: EditItem): EditItemRow {
  return { ...item, id: item.key };
}

export default function QuotationDetailClient({ quotation, products }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const orderLocked = quotation.orders != null && quotation.orders.status !== 'pending';
  const editable = quotation.status !== 'confirmed' && !orderLocked;

  const [items, setItems] = useState<EditItem[]>(
    quotation.quotation_items.map((item) => ({
      key: nextKey(),
      type: classifyItem(item),
      product_id: item.product_id,
      label: item.label ?? item.products?.name ?? '',
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      is_taxable: item.is_taxable,
      discount_mode: 'amount',
    })),
  );

  const [dirty, setDirty] = useState(false);

  function toggleDiscountMode(key: string) {
    setItems((prev) => {
      // 할인 기준: 제품+기타 소계
      const baseTotal = prev
        .filter((i) => i.type === 'product' || i.type === 'custom')
        .reduce((s, i) => s + (parseInt(i.quantity, 10) || 0) * (parseFloat(i.unit_price) || 0), 0);
      return prev.map((item) => {
        if (item.key !== key) return item;
        const newMode: DiscountMode = item.discount_mode === 'amount' ? 'percent' : 'amount';
        if (newMode === 'percent') {
          const currentAmount = Math.abs(parseFloat(item.unit_price) || 0);
          const pct = baseTotal > 0 ? Math.round((currentAmount / baseTotal) * 100) : 0;
          return { ...item, discount_mode: newMode, unit_price: String(pct), quantity: '1' };
        } else {
          const pct = parseFloat(item.unit_price) || 0;
          const amount = Math.round(baseTotal * pct / 100);
          return { ...item, discount_mode: newMode, unit_price: String(amount), quantity: '1' };
        }
      });
    });
    setDirty(true);
  }

  function updateItem(key: string, field: keyof Omit<EditItem, 'key' | 'type'>, value: string | boolean) {
    setItems((prev) => prev.map((item) =>
      item.key === key ? { ...item, [field]: value } : item,
    ));
    setDirty(true);
  }

  function handleProductChange(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    setItems((prev) => prev.map((item) =>
      item.key === key
        ? { ...item, product_id: productId, label: product?.name ?? '', unit_price: String(product?.base_price ?? 0) }
        : item,
    ));
    setDirty(true);
  }

  function addProductItem() {
    setItems((prev) => [...prev, { key: nextKey(), type: 'product', product_id: null, label: '', quantity: '1', unit_price: '0', is_taxable: true, discount_mode: 'amount' }]);
    setDirty(true);
  }

  function addCustomItem() {
    setItems((prev) => [...prev, { key: nextKey(), type: 'custom', product_id: null, label: '', quantity: '1', unit_price: '0', is_taxable: true, discount_mode: 'amount' }]);
    setDirty(true);
  }

  function addDiscountItem() {
    setItems((prev) => [...prev, { key: nextKey(), type: 'discount', product_id: null, label: '', quantity: '1', unit_price: '0', is_taxable: false, discount_mode: 'amount' }]);
    setDirty(true);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
    setDirty(true);
  }

  function handleStatusChange(status: QuotationStatus) {
    startTransition(async () => {
      const result = await updateQuotationStatus(quotation.id, status);
      if (result.error) toast.error(result.error);
      else { toast.success('상태가 변경되었습니다'); router.refresh(); }
    });
  }

  // 항목 파싱 + 검증 → 저장. 성공 시 true, 실패 시 false
  async function saveItems(): Promise<boolean> {
    const parsed = items.map((item) => {
      const qty = parseInt(item.quantity, 10) || 0;
      const price = parseFloat(item.unit_price) || 0;
      let finalPrice = price;
      let finalQty = qty;
      if (item.type === 'discount') {
        if (item.discount_mode === 'percent') {
          // 퍼센트 → 금액으로 변환해서 저장
          finalPrice = -Math.round(preDiscountTotal * price / 100);
          finalQty = 1;
        } else {
          finalPrice = -Math.abs(price);
        }
      }
      return {
        product_id: item.type === 'product' ? item.product_id : null,
        label: item.type !== 'product' ? item.label : null,
        quantity: finalQty,
        unit_price: item.type === 'discount' ? finalPrice : price,
        is_taxable: item.is_taxable,
      };
    });

    // 제품 항목 검증
    const pItems = parsed.filter((_, i) => items[i].type === 'product');
    if (pItems.some((i) => !i.product_id)) {
      toast.error('제품을 선택하세요');
      return false;
    }

    // 커스텀/할인 항목 검증
    const cItems = parsed.filter((_, i) => items[i].type !== 'product');
    if (cItems.some((i) => !i.label?.trim())) {
      toast.error('항목명을 입력하세요');
      return false;
    }

    if (parsed.some((i) => i.quantity < 1)) {
      toast.error('수량은 1 이상이어야 합니다');
      return false;
    }

    const result = await updateQuotationItems(quotation.id, parsed);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    setDirty(false);
    return true;
  }

  function handleSave() {
    startTransition(async () => {
      const ok = await saveItems();
      if (ok) {
        toast.success('견적서가 수정되었습니다');
        router.refresh();
      }
    });
  }

  function handleSend() {
    if (!confirm('선택하신 내용으로 견적서를 발송하시겠습니까?')) return;
    startTransition(async () => {
      if (dirty) {
        const ok = await saveItems();
        if (!ok) return;
      }
      const result = await sendQuotationEmail(quotation.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`견적서 ${result.number} 이메일 발송 완료`);
        router.refresh();
      }
    });
  }

  function handleDownload() {
    startTransition(async () => {
      if (dirty) {
        const ok = await saveItems();
        if (!ok) return;
      }
      const res = await fetch(`/api/quotations/${quotation.id}/pdf`);
      if (!res.ok) { toast.error('PDF 생성 실패'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `견적서_${quotation.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // 금액 계산
  const productSubtotal = items
    .filter((i) => i.type === 'product')
    .reduce((s, i) => s + (parseInt(i.quantity, 10) || 0) * (parseFloat(i.unit_price) || 0), 0);
  const customSubtotal = items
    .filter((i) => i.type === 'custom')
    .reduce((s, i) => s + (parseInt(i.quantity, 10) || 0) * (parseFloat(i.unit_price) || 0), 0);
  const preDiscountTotal = productSubtotal + customSubtotal;
  const discountTotal = items
    .filter((i) => i.type === 'discount')
    .reduce((s, i) => {
      if (i.discount_mode === 'percent') {
        const pct = parseFloat(i.unit_price) || 0;
        return s + Math.round(preDiscountTotal * pct / 100);
      }
      return s + (parseInt(i.quantity, 10) || 0) * Math.abs(parseFloat(i.unit_price) || 0);
    }, 0);
  const subtotal = productSubtotal + customSubtotal - discountTotal;
  const taxableTotal = items
    .filter((i) => i.is_taxable)
    .reduce((s, i) => {
      const qty = parseInt(i.quantity, 10) || 0;
      const price = parseFloat(i.unit_price) || 0;
      if (i.type === 'discount') {
        if (i.discount_mode === 'percent') return s - Math.round(preDiscountTotal * price / 100);
        return s - qty * Math.abs(price);
      }
      return s + qty * price;
    }, 0);
  const tax = Math.floor(taxableTotal * 0.1);

  const productItems = items.filter((i) => i.type === 'product');
  const customItems = items.filter((i) => i.type === 'custom');
  const discountItems = items.filter((i) => i.type === 'discount');

  // 카드별 과세액
  const productTaxable = productItems
    .filter((i) => i.is_taxable)
    .reduce((s, i) => s + (parseInt(i.quantity, 10) || 0) * (parseFloat(i.unit_price) || 0), 0);
  const productTax = Math.floor(productTaxable * 0.1);

  const customTaxable = customItems
    .filter((i) => i.is_taxable)
    .reduce((s, i) => s + (parseInt(i.quantity, 10) || 0) * (parseFloat(i.unit_price) || 0), 0);
  const customTax = Math.floor(customTaxable * 0.1);

  const discountTaxable = discountItems
    .filter((i) => i.is_taxable)
    .reduce((s, i) => {
      if (i.discount_mode === 'percent') {
        const pct = parseFloat(i.unit_price) || 0;
        return s + Math.round(preDiscountTotal * pct / 100);
      }
      return s + (parseInt(i.quantity, 10) || 0) * Math.abs(parseFloat(i.unit_price) || 0);
    }, 0);
  const discountTax = Math.floor(discountTaxable * 0.1);

  // DataTable 용 행 데이터 (id 필드 추가)
  const productRows = useMemo(() => productItems.map(toRow), [productItems]);
  const customRows = useMemo(() => customItems.map(toRow), [customItems]);
  const discountRows = useMemo(() => discountItems.map(toRow), [discountItems]);

  // 제품 항목 컬럼
  const productColumns = useMemo<ColumnDef<EditItemRow, unknown>[]>(() => {
    const cols: ColumnDef<EditItemRow, unknown>[] = [
      {
        id: 'product',
        header: '제품',
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          if (editable) {
            return (
              <Select value={item.product_id ?? ''} onValueChange={(v) => handleProductChange(item.key, v)}>
                <SelectTrigger className="h-8 text-sm w-full">
                  <SelectValue placeholder="제품 선택" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }
          return <span className="text-sm">{item.label || '-'}</span>;
        },
      },
      {
        id: 'quantity',
        header: () => <div className="text-right">수량</div>,
        size: 96,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          if (editable) {
            return (
              <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.key, 'quantity', e.target.value)} className="h-8 text-right text-sm w-full" />
            );
          }
          return <div className="text-right text-sm">{item.quantity}</div>;
        },
      },
      {
        id: 'unit_price',
        header: () => <div className="text-right">단가</div>,
        size: 128,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const price = parseFloat(item.unit_price) || 0;
          if (editable) {
            return (
              <Input type="number" min={0} value={item.unit_price} onChange={(e) => updateItem(item.key, 'unit_price', e.target.value)} className="h-8 text-right text-sm w-full" />
            );
          }
          return <div className="text-right text-sm">{`₩${price.toLocaleString()}`}</div>;
        },
      },
      {
        id: 'amount',
        header: () => <div className="text-right">금액</div>,
        size: 128,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const qty = parseInt(item.quantity, 10) || 0;
          const price = parseFloat(item.unit_price) || 0;
          return <div className="text-right text-sm font-medium">{`₩${(qty * price).toLocaleString()}`}</div>;
        },
      },
      {
        id: 'tax',
        header: () => <div className="text-right">과세액</div>,
        size: 96,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const qty = parseInt(item.quantity, 10) || 0;
          const price = parseFloat(item.unit_price) || 0;
          return (
            <div className="text-right">
              <button
                type="button"
                onClick={() => { if (editable) updateItem(item.key, 'is_taxable', !item.is_taxable); }}
                className={`text-sm ${editable ? 'cursor-pointer hover:opacity-70' : ''} ${item.is_taxable ? 'text-gray-700' : 'text-gray-400'}`}
                disabled={!editable}
              >
                {item.is_taxable ? `₩${Math.floor(qty * price * 0.1).toLocaleString()}` : '비과세'}
              </button>
            </div>
          );
        },
      },
    ];
    if (editable) {
      cols.push({
        id: 'delete',
        header: '',
        size: 48,
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeItem(row.original.key)}>
            <Trash2 size={14} />
          </Button>
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, products]);

  // 기타 비용 컬럼
  const customColumns = useMemo<ColumnDef<EditItemRow, unknown>[]>(() => {
    const cols: ColumnDef<EditItemRow, unknown>[] = [
      {
        id: 'label',
        header: '항목명',
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          if (editable) {
            return (
              <Input placeholder="예: 수리비, 출장비, 포장비" value={item.label} onChange={(e) => updateItem(item.key, 'label', e.target.value)} className="h-8 text-sm" />
            );
          }
          return <span className="text-sm">{item.label}</span>;
        },
      },
      {
        id: 'quantity',
        header: () => <div className="text-right">수량</div>,
        size: 96,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          if (editable) {
            return (
              <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.key, 'quantity', e.target.value)} className="h-8 text-right text-sm w-full" />
            );
          }
          return <div className="text-right text-sm">{item.quantity}</div>;
        },
      },
      {
        id: 'unit_price',
        header: () => <div className="text-right">금액</div>,
        size: 128,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const price = parseFloat(item.unit_price) || 0;
          if (editable) {
            return (
              <Input type="number" min={0} value={item.unit_price} onChange={(e) => updateItem(item.key, 'unit_price', e.target.value)} className="h-8 text-right text-sm w-full" />
            );
          }
          return <div className="text-right text-sm">{`₩${price.toLocaleString()}`}</div>;
        },
      },
      {
        id: 'subtotal',
        header: () => <div className="text-right">소계</div>,
        size: 128,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const qty = parseInt(item.quantity, 10) || 0;
          const price = parseFloat(item.unit_price) || 0;
          return <div className="text-right text-sm font-medium">{`₩${(qty * price).toLocaleString()}`}</div>;
        },
      },
      {
        id: 'tax',
        header: () => <div className="text-right">과세액</div>,
        size: 96,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const qty = parseInt(item.quantity, 10) || 0;
          const price = parseFloat(item.unit_price) || 0;
          return (
            <div className="text-right">
              <button
                type="button"
                onClick={() => { if (editable) updateItem(item.key, 'is_taxable', !item.is_taxable); }}
                className={`text-sm ${editable ? 'cursor-pointer hover:opacity-70' : ''} ${item.is_taxable ? 'text-gray-700' : 'text-gray-400'}`}
                disabled={!editable}
              >
                {item.is_taxable ? `₩${Math.floor(qty * price * 0.1).toLocaleString()}` : '비과세'}
              </button>
            </div>
          );
        },
      },
    ];
    if (editable) {
      cols.push({
        id: 'delete',
        header: '',
        size: 48,
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeItem(row.original.key)}>
            <Trash2 size={14} />
          </Button>
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  // 할인 컬럼
  const discountColumns = useMemo<ColumnDef<EditItemRow, unknown>[]>(() => {
    const cols: ColumnDef<EditItemRow, unknown>[] = [
      {
        id: 'label',
        header: '할인 항목',
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          if (editable) {
            return (
              <Input placeholder="예: 단골 할인, 프로모션" value={item.label} onChange={(e) => updateItem(item.key, 'label', e.target.value)} className="h-8 text-sm" />
            );
          }
          return <span className="text-sm">{item.label}</span>;
        },
      },
      {
        id: 'quantity',
        header: () => <div className="text-right">수량</div>,
        size: 96,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          if (item.discount_mode === 'percent') {
            return <div className="text-right text-sm text-gray-400">-</div>;
          }
          if (editable) {
            return (
              <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.key, 'quantity', e.target.value)} className="h-8 text-right text-sm w-full" />
            );
          }
          return <div className="text-right text-sm">{item.quantity}</div>;
        },
      },
      {
        id: 'discount_mode',
        header: '유형',
        size: 80,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          if (editable) {
            return (
              <button
                type="button"
                onClick={() => toggleDiscountMode(item.key)}
                className="h-8 px-2 text-xs font-medium border rounded-md hover:bg-gray-50 transition-colors"
              >
                {item.discount_mode === 'percent' ? '%' : '₩'}
              </button>
            );
          }
          return <span className="text-xs text-gray-500">{item.discount_mode === 'percent' ? '%' : '₩'}</span>;
        },
      },
      {
        id: 'discount_price',
        header: () => <div className="text-right">할인값</div>,
        size: 128,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const value = Math.abs(parseFloat(item.unit_price) || 0);
          if (editable) {
            return (
              <div className="flex items-center gap-1">
                <Input
                  type="number" min={0}
                  value={String(value)}
                  onChange={(e) => updateItem(item.key, 'unit_price', e.target.value)}
                  className="h-8 text-right text-sm w-full"
                />
                {item.discount_mode === 'percent' && <span className="text-xs text-gray-400 shrink-0">%</span>}
              </div>
            );
          }
          return <div className="text-right text-sm">{item.discount_mode === 'percent' ? `${value}%` : `₩${value.toLocaleString()}`}</div>;
        },
      },
      {
        id: 'subtotal',
        header: () => <div className="text-right">할인액</div>,
        size: 128,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          let discountAmount: number;
          if (item.discount_mode === 'percent') {
            const pct = parseFloat(item.unit_price) || 0;
            discountAmount = Math.round(preDiscountTotal * pct / 100);
          } else {
            const qty = parseInt(item.quantity, 10) || 0;
            const price = Math.abs(parseFloat(item.unit_price) || 0);
            discountAmount = qty * price;
          }
          return <div className="text-right text-sm font-medium text-red-600">{`-₩${discountAmount.toLocaleString()}`}</div>;
        },
      },
      {
        id: 'tax',
        header: () => <div className="text-right">과세액</div>,
        size: 96,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          let discountAmt: number;
          if (item.discount_mode === 'percent') {
            const pct = parseFloat(item.unit_price) || 0;
            discountAmt = Math.round(preDiscountTotal * pct / 100);
          } else {
            const qty = parseInt(item.quantity, 10) || 0;
            const price = Math.abs(parseFloat(item.unit_price) || 0);
            discountAmt = qty * price;
          }
          return (
            <div className="text-right">
              <button
                type="button"
                onClick={() => { if (editable) updateItem(item.key, 'is_taxable', !item.is_taxable); }}
                className={`text-sm ${editable ? 'cursor-pointer hover:opacity-70' : ''} ${item.is_taxable ? 'text-red-600' : 'text-gray-400'}`}
                disabled={!editable}
              >
                {item.is_taxable ? `-₩${Math.floor(discountAmt * 0.1).toLocaleString()}` : '비과세'}
              </button>
            </div>
          );
        },
      },
    ];
    if (editable) {
      cols.push({
        id: 'delete',
        header: '',
        size: 48,
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeItem(row.original.key)}>
            <Trash2 size={14} />
          </Button>
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, preDiscountTotal]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/quotations')}>
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">견적서 {quotation.number}</h1>
          <Badge variant={statusVariant[quotation.status]} className="shrink-0">
            {statusLabel[quotation.status]}
          </Badge>
        </div>
        <div className="pl-10 sm:pl-0 sm:ml-auto shrink-0">
          <Select
            value={quotation.status}
            onValueChange={(v) => handleStatusChange(v as QuotationStatus)}
            disabled={isPending}
          >
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">초안</SelectItem>
              <SelectItem value="sent">발송</SelectItem>
              <SelectItem value="confirmed">확정</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500">업체명</p>
            {quotation.companies ? (
              <Link href={`/companies/${quotation.companies.id}`} className="font-medium hover:underline">
                {quotation.companies.name}
              </Link>
            ) : (
              <p className="font-medium">-</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500">발행자</p>
            <p className="font-medium">{quotation.issued_by ? quotation.issued_by.split('@')[0] : '-'}</p>
            {quotation.issued_by && (
              <p className="text-xs text-gray-400">{quotation.issued_by}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500">발행일</p>
            <p className="font-medium">{dayjs(quotation.issued_at).format('YYYY-MM-DD')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500">연결 발주</p>
            {quotation.order_id ? (
              <Link href={`/orders/${quotation.order_id}`} className="font-medium text-blue-600 hover:underline">
                {quotation.orders?.order_number ?? '발주 상세 보기'}
              </Link>
            ) : (
              <p className="font-medium text-gray-400">없음</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 제품 항목 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">제품 항목</CardTitle>
            {editable && (
              <Button variant="outline" size="sm" className="h-8" onClick={addProductItem}>
                <Plus size={14} /> 제품 추가
              </Button>
            )}
            {!editable && (
              <p className="text-xs text-gray-400">
                {quotation.status === 'confirmed' ? '확정된 견적서는 수정 불가' : '발주가 확정되어 수정 불가'}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={productColumns}
            data={productRows}
            emptyMessage="제품 항목이 없습니다"
          />
          {productItems.length > 0 && (
            <div className="px-4 py-2 border-t text-right text-sm text-gray-500 space-y-0.5">
              <div>소계: ₩{productSubtotal.toLocaleString()}</div>
              {productTaxable > 0 && (
                <>
                  <div className="text-xs text-gray-400">과세: ₩{productTax.toLocaleString()}</div>
                  <div className="text-xs text-gray-400">과세포함: ₩{(productSubtotal + productTax).toLocaleString()}</div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 기타 비용 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">기타 비용</CardTitle>
            {editable && (
              <Button variant="outline" size="sm" className="h-8" onClick={addCustomItem}>
                <PlusCircle size={14} /> 항목 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={customColumns}
            data={customRows}
            emptyMessage="기타 비용 없음"
          />
          {customItems.length > 0 && (
            <div className="px-4 py-2 border-t text-right text-sm text-gray-500 space-y-0.5">
              <div>소계: ₩{customSubtotal.toLocaleString()}</div>
              {customTaxable > 0 && (
                <>
                  <div className="text-xs text-gray-400">과세: ₩{customTax.toLocaleString()}</div>
                  <div className="text-xs text-gray-400">과세포함: ₩{(customSubtotal + customTax).toLocaleString()}</div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 할인 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">할인</CardTitle>
            {editable && (
              <Button variant="outline" size="sm" className="h-8" onClick={addDiscountItem}>
                <MinusCircle size={14} /> 할인 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={discountColumns}
            data={discountRows}
            emptyMessage="할인 없음"
          />
          {discountItems.length > 0 && (
            <div className="px-4 py-2 border-t text-right text-sm text-red-500 space-y-0.5">
              <div>할인 합계: -₩{discountTotal.toLocaleString()}</div>
              {discountTaxable > 0 && (
                <>
                  <div className="text-xs text-red-400">과세 감면: -₩{discountTax.toLocaleString()}</div>
                  <div className="text-xs text-red-400">과세포함: -₩{(discountTotal + discountTax).toLocaleString()}</div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 합계 */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-1">
          <div className="flex justify-between text-sm text-gray-500">
            <span>공급가액</span><span>₩{subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>부가세 (과세 항목 × 10%)</span><span>₩{tax.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-base font-bold pt-1 border-t">
            <span>합계</span><span>₩{(subtotal + tax).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* 하단 액션 버튼 */}
      <div className="flex justify-end gap-2">
        {editable && dirty && (
          <Button onClick={handleSave} disabled={isPending}>
            <Save size={14} /> 변경사항 저장
          </Button>
        )}
        <Button variant="outline" onClick={handleDownload} disabled={isPending}>
          <Download size={14} /> PDF 다운로드
        </Button>
        <Button onClick={handleSend} disabled={isPending}>
          <Send size={14} /> 이메일 발송
        </Button>
      </div>
    </div>
  );
}
