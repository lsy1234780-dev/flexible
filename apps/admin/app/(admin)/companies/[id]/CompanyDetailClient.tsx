'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, Send, Pencil, Check, X } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/ui/data-table';
import { Textarea } from '@/components/ui/textarea';
import { upsertCompanyProduct, updateCompanyStatus, updateCompany } from '@/actions/companies';
import { addCrmMemo } from '@/actions/orders';
import CountrySelect from '@/components/CountrySelect';
import ShareToChat from '@/components/ShareToChat';
import RecordChatPanel from '@/components/RecordChatPanel';
import type { Company, CrmLog } from '@/types/database';
import dayjs from 'dayjs';

interface ProductRow {
  product: { id: string; name: string; barcode: string; base_price: number; base_stock: number };
  override: {
    custom_price: number | null;
    visible_stock: number | null;
    stock_ratio: number | null;
    max_visible_stock: number | null;
    is_visible: boolean;
  } | null;
  effectivePrice: number;
  effectiveStock: number;
  isVisible: boolean;
}

type ProductRowWithId = ProductRow & { id: string };

interface Transaction {
  id: string;
  type: 'purchase' | 'sale';
  label: string;
  amount: number | null;
  currency: string;
  status: string;
  date: string;
  itemSummary: string;
}

interface Props {
  company: Company;
  companyProducts: ProductRow[];
  crmLogs: CrmLog[];
  transactions: Transaction[];
}

type StockMode = 'direct' | 'ratio';

interface EditState {
  custom_price: string;
  stock_mode: StockMode;
  visible_stock: string;
  stock_ratio: string;
  max_visible_stock: string;
  is_visible: boolean;
}

function calcPreviewStock(baseStock: number, edit: EditState): number {
  if (edit.stock_mode === 'direct') {
    return edit.visible_stock !== '' ? Number(edit.visible_stock) : baseStock;
  }
  let stock = baseStock;
  if (edit.stock_ratio !== '') stock = Math.floor(baseStock * Number(edit.stock_ratio) / 100);
  if (edit.max_visible_stock !== '') stock = Math.min(stock, Number(edit.max_visible_stock));
  return stock;
}

const statusLabel: Record<Company['status'], string> = {
  pending: '승인대기',
  active: '활성',
  suspended: '정지',
};

const statusColor: Record<Company['status'], string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  active: 'bg-green-50 text-green-700 border-green-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
};

const crmActionLabel: Record<string, string> = {
  '발주 확정': '확정',
  '출고 지시': '출고',
  '배송 완료': '완료',
  '발주 취소': '취소',
  '메모': '메모',
};

const txStatusLabel: Record<string, string> = {
  pending: '대기',
  confirmed: '확정',
  shipped: '출고',
  packed: '집하',
  completed: '완료',
  cancelled: '취소',
  unpaid: '미결제',
  partial: '부분결제',
  paid: '결제완료',
};

export default function CompanyDetailClient({ company, companyProducts, crmLogs, transactions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [memo, setMemo] = useState('');

  // 담당자 편집
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    contact_name: company.contact_name ?? '',
    contact_position: company.contact_position ?? '',
    contact_phone: company.contact_phone ?? '',
    contact_email: company.contact_email ?? '',
  });

  function startEditContact() {
    setContactForm({
      contact_name: company.contact_name ?? '',
      contact_position: company.contact_position ?? '',
      contact_phone: company.contact_phone ?? '',
      contact_email: company.contact_email ?? '',
    });
    setEditingContact(true);
  }

  function cancelEditContact() {
    setEditingContact(false);
  }

  function saveContact() {
    startTransition(async () => {
      const result = await updateCompany(company.id, {
        contact_name: contactForm.contact_name || null,
        contact_position: contactForm.contact_position || null,
        contact_phone: contactForm.contact_phone || null,
        contact_email: contactForm.contact_email || null,
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success('담당자 정보가 저장되었습니다');
        setEditingContact(false);
        router.refresh();
      }
    });
  }

  function handleStatusChange(status: Company['status']) {
    startTransition(async () => {
      const result = await updateCompanyStatus(company.id, status);
      if (result.error) toast.error(result.error);
      else {
        toast.success(
          status === 'active'
            ? '활성화되었습니다. 안내 이메일을 발송했습니다.'
            : '상태가 변경되었습니다.',
        );
        router.refresh();
      }
    });
  }

  function handleCountryChange(code: string | null) {
    startTransition(async () => {
      const result = await updateCompany(company.id, { country: code });
      if (result.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function handleRoleToggle(field: 'is_supplier' | 'is_customer', value: boolean) {
    startTransition(async () => {
      const result = await updateCompany(company.id, { [field]: value });
      if (result.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function handleAddMemo() {
    if (!memo.trim()) return;
    startTransition(async () => {
      const result = await addCrmMemo(company.id, memo.trim());
      if (result.error) toast.error(result.error);
      else {
        toast.success('메모가 추가되었습니다');
        setMemo('');
        router.refresh();
      }
    });
  }

  function getEdit(productId: string, row: ProductRow): EditState {
    if (editing[productId]) return editing[productId];
    const o = row.override;
    const stock_mode: StockMode = (o?.stock_ratio != null || o?.max_visible_stock != null) ? 'ratio' : 'direct';
    return {
      custom_price: o?.custom_price != null ? String(o.custom_price) : '',
      stock_mode,
      visible_stock: o?.visible_stock != null ? String(o.visible_stock) : '',
      stock_ratio: o?.stock_ratio != null ? String(o.stock_ratio) : '',
      max_visible_stock: o?.max_visible_stock != null ? String(o.max_visible_stock) : '',
      is_visible: row.isVisible,
    };
  }

  function setField<K extends keyof EditState>(productId: string, row: ProductRow, field: K, value: EditState[K]) {
    setEditing((prev) => ({
      ...prev,
      [productId]: { ...getEdit(productId, row), [field]: value },
    }));
  }

  function setMode(productId: string, row: ProductRow, mode: StockMode) {
    setEditing((prev) => ({
      ...prev,
      [productId]: {
        ...getEdit(productId, row),
        stock_mode: mode,
        ...(mode === 'direct' ? { stock_ratio: '', max_visible_stock: '' } : { visible_stock: '' }),
      },
    }));
  }

  function handleSave(productId: string, row: ProductRow) {
    const edit = getEdit(productId, row);

    if (edit.stock_mode === 'ratio' && edit.stock_ratio !== '') {
      const ratio = Number(edit.stock_ratio);
      if (ratio < 1 || ratio > 100) {
        toast.error('노출 비율은 1~100 사이로 입력하세요');
        return;
      }
    }

    startTransition(async () => {
      const result = await upsertCompanyProduct(company.id, productId, {
        custom_price: edit.custom_price !== '' ? Number(edit.custom_price) : null,
        visible_stock: edit.stock_mode === 'direct' && edit.visible_stock !== '' ? Number(edit.visible_stock) : null,
        stock_ratio: edit.stock_mode === 'ratio' && edit.stock_ratio !== '' ? Number(edit.stock_ratio) : null,
        max_visible_stock: edit.stock_mode === 'ratio' && edit.max_visible_stock !== '' ? Number(edit.max_visible_stock) : null,
        is_visible: edit.is_visible,
      });
      if (result.error) toast.error(result.error);
      else { toast.success('저장되었습니다'); router.refresh(); }
    });
  }

  const dataWithId: ProductRowWithId[] = useMemo(
    () => companyProducts.map((row) => ({ ...row, id: row.product.id })),
    [companyProducts],
  );

  const columns: ColumnDef<ProductRowWithId, unknown>[] = useMemo(() => [
    {
      id: 'name',
      header: '제품명',
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div>
            <p className="font-medium text-sm">{r.product.name}</p>
            <p className="text-xs text-gray-400 font-mono">{r.product.barcode}</p>
            <p className="text-xs text-gray-400">기본재고 {r.product.base_stock}</p>
          </div>
        );
      },
    },
    {
      id: 'base_price',
      header: () => <span className="w-full text-right block">기본단가</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right text-sm text-gray-500">
          ₩{row.original.product.base_price.toLocaleString()}
        </div>
      ),
    },
    {
      id: 'custom_price',
      header: () => <span className="w-full text-right block">업체단가</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const edit = getEdit(r.product.id, r);
        return (
          <div className="text-right">
            <Input
              type="number" min={0}
              value={edit.custom_price}
              onChange={(e) => setField(r.product.id, r, 'custom_price', e.target.value)}
              placeholder="기본단가"
              className="w-28 h-8 text-right text-sm"
            />
          </div>
        );
      },
    },
    {
      id: 'stock_settings',
      header: '재고 노출 설정',
      size: 288,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const edit = getEdit(r.product.id, r);
        return (
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden shrink-0 text-xs">
              <button
                type="button"
                onClick={() => setMode(r.product.id, r, 'direct')}
                className={`px-2 py-1 transition-colors ${edit.stock_mode === 'direct' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                직접
              </button>
              <button
                type="button"
                onClick={() => setMode(r.product.id, r, 'ratio')}
                className={`px-2 py-1 transition-colors border-l ${edit.stock_mode === 'ratio' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                비율
              </button>
            </div>

            {edit.stock_mode === 'direct' && (
              <Input
                type="number" min={0}
                value={edit.visible_stock}
                onChange={(e) => setField(r.product.id, r, 'visible_stock', e.target.value)}
                placeholder="기본재고"
                className="h-7 text-right text-xs w-24"
              />
            )}

            {edit.stock_mode === 'ratio' && (
              <div className="flex items-center gap-1">
                <Input
                  type="number" min={1} max={100}
                  value={edit.stock_ratio}
                  onChange={(e) => setField(r.product.id, r, 'stock_ratio', e.target.value)}
                  placeholder="100"
                  className="h-7 text-right text-xs w-14"
                />
                <span className="text-xs text-gray-500 shrink-0">%</span>
                <span className="text-xs text-gray-400 shrink-0">max</span>
                <Input
                  type="number" min={0}
                  value={edit.max_visible_stock}
                  onChange={(e) => setField(r.product.id, r, 'max_visible_stock', e.target.value)}
                  placeholder="∞"
                  className="h-7 text-right text-xs w-16"
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'effective_stock',
      header: () => <span className="w-full text-right block">실효재고</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const edit = getEdit(r.product.id, r);
        const preview = calcPreviewStock(r.product.base_stock, edit);
        const isChanged = preview !== r.product.base_stock;
        return (
          <div className="text-right">
            <span className={`text-sm font-semibold ${isChanged ? 'text-blue-600' : 'text-gray-400'}`}>
              {preview}
            </span>
          </div>
        );
      },
    },
    {
      id: 'is_visible',
      header: () => <span className="w-full text-center block">노출</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const edit = getEdit(r.product.id, r);
        return (
          <div className="text-center">
            <input
              type="checkbox"
              checked={edit.is_visible}
              onChange={(e) => setField(r.product.id, r, 'is_visible', e.target.checked)}
              className="h-4 w-4"
            />
          </div>
        );
      },
    },
    {
      id: 'save',
      header: () => <span className="w-full text-right block">저장</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="text-right">
            <Button
              size="sm" variant="outline"
              onClick={() => handleSave(r.product.id, r)}
              disabled={isPending}
              className="h-8 text-xs"
            >
              저장
            </Button>
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isPending, editing]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/companies')}>
            <ArrowLeft size={18} />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold truncate">{company.name}</h1>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${statusColor[company.status]}`}>
                {statusLabel[company.status]}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              등록일 {dayjs(company.created_at).format('YYYY-MM-DD')}
              {company.country && <span className="ml-2">· {company.country}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-10 sm:pl-0 sm:ml-auto shrink-0">
          <ShareToChat entityType="company" entityId={company.id} label={company.name} />
          <Select
            value={company.status}
            onValueChange={(v) => handleStatusChange(v as Company['status'])}
            disabled={isPending}
          >
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">승인대기</SelectItem>
              <SelectItem value="active">활성</SelectItem>
              <SelectItem value="suspended">정지</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 업체 정보 + 담당자 — 2컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 업체 정보 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">업체 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 w-16 shrink-0">구분</span>
                <div className="flex gap-3 flex-1">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={company.is_supplier}
                      onChange={(e) => handleRoleToggle('is_supplier', e.target.checked)}
                      disabled={isPending}
                      className="rounded border-gray-300"
                    />
                    공급처
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={company.is_customer}
                      onChange={(e) => handleRoleToggle('is_customer', e.target.checked)}
                      disabled={isPending}
                      className="rounded border-gray-300"
                    />
                    고객사
                  </label>
                </div>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-500 w-16 shrink-0 pt-2">국가</span>
                <div className="flex-1">
                  <CountrySelect
                    value={company.country}
                    onChange={handleCountryChange}
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 담당자 정보 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">담당자 정보</CardTitle>
              {!editingContact ? (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-500" onClick={startEditContact}>
                  <Pencil size={12} className="mr-1" />
                  수정
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-500" onClick={cancelEditContact} disabled={isPending}>
                    <X size={12} className="mr-1" />
                    취소
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={saveContact} disabled={isPending}>
                    <Check size={12} className="mr-1" />
                    저장
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingContact ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">담당자명</label>
                    <Input
                      value={contactForm.contact_name}
                      onChange={(e) => setContactForm({ ...contactForm, contact_name: e.target.value })}
                      placeholder="이름"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">직무</label>
                    <Input
                      value={contactForm.contact_position}
                      onChange={(e) => setContactForm({ ...contactForm, contact_position: e.target.value })}
                      placeholder="직무/직급"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">연락처</label>
                  <Input
                    value={contactForm.contact_phone}
                    onChange={(e) => setContactForm({ ...contactForm, contact_phone: e.target.value })}
                    placeholder="010-0000-0000"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">이메일</label>
                  <Input
                    value={contactForm.contact_email}
                    onChange={(e) => setContactForm({ ...contactForm, contact_email: e.target.value })}
                    placeholder="email@example.com"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">담당자명</p>
                    <p className="text-sm font-medium">{company.contact_name || <span className="text-gray-300">-</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">직무</p>
                    <p className="text-sm font-medium">{company.contact_position || <span className="text-gray-300">-</span>}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">연락처</p>
                  <p className="text-sm font-medium">{company.contact_phone || <span className="text-gray-300">-</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">이메일</p>
                  <p className="text-sm font-medium break-all">{company.contact_email || <span className="text-gray-300">-</span>}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 제품별 단가/재고/노출 — 고객사일 때만 표시 */}
      {company.is_customer && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">제품별 단가·재고·노출 설정</CardTitle>
            <p className="text-xs text-gray-500">단가 비워두면 기본단가 적용 · 재고는 직접입력 또는 비율 중 선택</p>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable columns={columns} data={dataWithId} />
          </CardContent>
        </Card>
      )}

      {/* 거래 이력 + CRM 이력 — 2컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 거래 이력 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">거래 이력</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">거래 이력이 없습니다</p>
            ) : (
              <div className="space-y-0">
                {transactions.map((tx) => {
                  const href = tx.type === 'purchase' ? `/receiving/${tx.id}` : `/orders/${tx.id}`;
                  return (
                    <Link
                      key={`${tx.type}-${tx.id}`}
                      href={href}
                      className="flex items-center gap-3 py-2.5 border-b last:border-0 hover:bg-gray-50 transition-colors -mx-2 px-2 rounded"
                    >
                      <Badge
                        variant={tx.type === 'purchase' ? 'secondary' : 'outline'}
                        className="text-[10px] w-10 justify-center shrink-0"
                      >
                        {tx.type === 'purchase' ? '사입' : '판매'}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.label}</p>
                        <p className="text-xs text-gray-400">
                          {dayjs(tx.date).format('YY.MM.DD')}
                          {tx.itemSummary && <span className="ml-1">· {tx.itemSummary}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={
                            tx.status === 'completed' || tx.status === 'paid' ? 'default'
                              : tx.status === 'cancelled' ? 'destructive'
                              : 'outline'
                          }
                          className="text-[10px]"
                        >
                          {txStatusLabel[tx.status] ?? tx.status}
                        </Badge>
                        {tx.amount != null && (
                          <span className="text-xs font-medium tabular-nums text-gray-600">
                            {tx.currency === 'KRW' ? '₩' : tx.currency === 'USD' ? '$' : tx.currency + ' '}
                            {tx.amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CRM 이력 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">CRM 이력</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 메모 입력 */}
            <div className="flex gap-2">
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모를 입력하세요..."
                className="min-h-[56px] text-sm resize-none"
              />
              <Button
                size="sm"
                onClick={handleAddMemo}
                disabled={isPending || !memo.trim()}
                className="shrink-0 self-end"
              >
                <Send size={14} />
              </Button>
            </div>

            {/* 타임라인 */}
            {crmLogs.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">이력이 없습니다</p>
            ) : (
              <div className="space-y-0">
                {crmLogs.map((log) => (
                  <div key={log.id} className="flex gap-3 py-2.5 border-b last:border-0">
                    <Badge
                      variant={
                        log.action === '발주 취소' ? 'destructive'
                          : log.action === '메모' ? 'outline'
                          : 'secondary'
                      }
                      className="text-[10px] w-10 justify-center shrink-0"
                    >
                      {crmActionLabel[log.action] ?? log.action}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        {log.action}
                        {log.memo && <span className="text-gray-500 ml-1">— {log.memo}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {dayjs(log.created_at).format('YY.MM.DD HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 관련 대화 (역링크) */}
        <Card>
          <CardContent className="py-4">
            <RecordChatPanel entityType="company" entityId={company.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
