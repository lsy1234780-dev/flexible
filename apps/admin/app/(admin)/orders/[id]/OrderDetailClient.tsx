'use client';

import { useState, useTransition, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, FileDown, CheckCircle, Truck, PackageCheck,
  XCircle, Save, Send, Mail, MailCheck, MessageSquareText, Plus,
  Package, Loader2, Check, ChevronDown, ChevronUp, Trash2, RefreshCw, ListChecks, Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ShareToChat from '@/components/ShareToChat';
import RecordThread from '@/components/RecordThread';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { type ColumnDef } from '@tanstack/react-table';
import { confirmOrder, shipOrder, completeOrder, cancelOrder, updateOrderItems, sendShipmentNotification } from '@/actions/orders';
import ApprovalPanel from '@/components/ApprovalPanel';
import { createQuotationFromOrder, sendQuotationEmail } from '@/actions/quotations';
import {
  getShipmentDetail, getAvailableSerials, autoAssignSerials,
  assignSerials, assignQuantityOnly, unassignSerial,
  getShipmentSerials, updateSerialLevel,
  getShipmentSerialCount, assignSerialsByText,
  matchSerialsAcrossProducts,
} from '@/actions/shipments';
import dayjs from 'dayjs';

// ── 타입 ──

type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'packed' | 'completed' | 'cancelled';
type TabId = 'order' | 'shipment';
type SerialLevel = 'L0' | 'L1' | 'L2' | 'L3';

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products: { name: string; barcode: string } | null;
}

interface QuotationItem {
  product_id: string | null;
  label: string | null;
  quantity: number;
  unit_price: number;
  is_taxable: boolean;
}

interface Quotation {
  id: string;
  number: string;
  status: string;
  issued_at: string;
  quotation_items: QuotationItem[];
}

interface Order {
  id: string;
  order_number: string | null;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  companies: {
    id: string;
    name: string;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    contact_position: string | null;
  } | null;
  order_items: OrderItem[];
  quotations: Quotation[] | null;
  shipments: { id: string; notified_at: string | null; serial_level: string; serial_source: string | null }[] | null;
}

interface Props { order: Order; }

const statusLabel: Record<OrderStatus, string> = {
  pending: '접수',
  confirmed: '확정',
  shipped: '출고지시',
  packed: '집하완료',
  completed: '출하완료',
  cancelled: '취소',
};

const statusVariant: Record<OrderStatus, 'outline' | 'default' | 'secondary' | 'destructive'> = {
  pending: 'outline',
  confirmed: 'default',
  shipped: 'secondary',
  packed: 'secondary',
  completed: 'secondary',
  cancelled: 'destructive',
};

interface EditableItem {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  quantity: string;
  unit_price: string;
}

// 탭 매핑: 각 상태가 어떤 탭에 속하는지
const STATUS_STEPS: { status: OrderStatus; label: string; tab: TabId }[] = [
  { status: 'pending', label: '접수', tab: 'order' },
  { status: 'confirmed', label: '확정', tab: 'order' },
  { status: 'shipped', label: '출고지시', tab: 'shipment' },
  { status: 'packed', label: '집하완료', tab: 'shipment' },
  { status: 'completed', label: '출하완료', tab: 'shipment' },
];

// ── 시리얼 관련 타입 ──
interface ShipProduct {
  id: string;
  name: string;
  barcode: string;
  serial_mode: string;
  base_stock: number;
}

interface ShipOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products: ShipProduct | null;
}

interface AssignedSerial {
  id: string;
  quantity: number;
  assigned_by: string | null;
  created_at: string;
  inventory_items: {
    id: string;
    serial_number: number;
    unit_barcode: string;
    manufacturer_serial: string | null;
  } | null;
  products: { id: string; name: string; barcode: string; serial_mode: string } | null;
}

interface AvailableSerial {
  id: string;
  serial_number: number;
  unit_barcode: string;
  manufacturer_serial: string | null;
  status: string;
  product_lots: { lot_number: string; manufactured_at: string; received_at: string } | null;
}

// ── 시리얼 선택 테이블 통합 행 타입 ──
interface SerialRow {
  id: string;
  originalId: string;
  inventoryItemId: string | null;
  kind: 'assigned' | 'available';
  serial_number: number | null;
  unit_barcode: string | null;
  manufacturer_serial: string | null;
  lot_number: string | null;
  assigned_by: string | null;
  quantity: number;
}

// ── 메인 컴포넌트 ──

export default function OrderDetailClient({ order }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const editable = order.status === 'pending';
  const shipment = Array.isArray(order.shipments) ? order.shipments[0] : null;
  const notified = !!shipment?.notified_at;

  // 탭 상태: 현재 상태에 맞는 탭으로 초기화
  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.status === order.status);
  const initialTab: TabId = currentStepIdx >= 2 ? 'shipment' : 'order';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // 출고 지시 다이얼로그
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [shipSerialLevel, setShipSerialLevel] = useState<SerialLevel>('L0');

  // 편집 가능 항목
  const [editItems, setEditItems] = useState<EditableItem[]>(
    order.order_items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.products?.name ?? '-',
      barcode: item.products?.barcode ?? '',
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
    })),
  );
  const [dirty, setDirty] = useState(false);

  function updateEditItem(index: number, field: 'quantity' | 'unit_price', value: string) {
    setEditItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    ));
    setDirty(true);
  }

  const subtotal = editItems.reduce((s, i) => {
    const qty = parseInt(i.quantity, 10) || 0;
    const price = parseFloat(i.unit_price) || 0;
    return s + qty * price;
  }, 0);
  const tax = Math.floor(subtotal * 0.1);

  const quotations = Array.isArray(order.quotations) ? order.quotations : [];
  const latestQuotation = quotations.length > 0
    ? quotations.reduce((a, b) => new Date(a.issued_at) > new Date(b.issued_at) ? a : b)
    : null;

  const quotationSummary = latestQuotation ? (() => {
    const items = latestQuotation.quotation_items ?? [];
    const productTotal = items.filter((i) => i.product_id).reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const customTotal = items.filter((i) => !i.product_id && i.unit_price >= 0).reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const discountTotal = items.filter((i) => !i.product_id && i.unit_price < 0).reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const supplyAmount = productTotal + customTotal + discountTotal;
    const taxableAmount = items.filter((i) => i.is_taxable !== false).reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const taxAmount = Math.round(taxableAmount * 0.1);
    return { productTotal, customTotal, discountTotal, supplyAmount, taxAmount, total: supplyAmount + taxAmount };
  })() : null;

  // ── 테이블 컬럼 정의 ──

  const orderItemColumns = useMemo<ColumnDef<EditableItem, unknown>[]>(() => [
    {
      accessorKey: 'product_name',
      header: '제품명',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.product_name}</p>
          <p className="text-xs text-gray-400 font-mono">{row.original.barcode}</p>
        </div>
      ),
    },
    {
      accessorKey: 'unit_price',
      header: () => <span className="flex justify-end">단가</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const index = editItems.findIndex((i) => i.id === row.original.id);
        const price = parseFloat(row.original.unit_price) || 0;
        return (
          <div className="text-right">
            {editable ? (
              <Input type="number" min={0} value={row.original.unit_price} onChange={(e) => updateEditItem(index, 'unit_price', e.target.value)} className="h-8 text-right text-sm w-28 ml-auto" />
            ) : (
              <span className="text-sm">{'\u20A9'}{price.toLocaleString()}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'quantity',
      header: () => <span className="flex justify-end">수량</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const index = editItems.findIndex((i) => i.id === row.original.id);
        const qty = parseInt(row.original.quantity, 10) || 0;
        return (
          <div className="text-right">
            {editable ? (
              <Input type="number" min={1} value={row.original.quantity} onChange={(e) => updateEditItem(index, 'quantity', e.target.value)} className="h-8 text-right text-sm w-20 ml-auto" />
            ) : (
              <span className="text-sm">{qty}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'subtotal',
      header: () => <span className="flex justify-end">소계</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const qty = parseInt(row.original.quantity, 10) || 0;
        const price = parseFloat(row.original.unit_price) || 0;
        return <div className="text-right text-sm font-medium">{'\u20A9'}{(qty * price).toLocaleString()}</div>;
      },
    },
  ], [editable, editItems]);

  const shipmentItemColumns = useMemo<ColumnDef<ShipOrderItem, unknown>[]>(() => [
    {
      id: 'product_name',
      header: '제품',
      enableSorting: false,
      cell: ({ row }) => {
        const product = row.original.products as unknown as { name: string; barcode: string } | null;
        return <span className="text-sm font-medium">{product?.name ?? '-'}</span>;
      },
    },
    {
      id: 'barcode',
      header: '바코드',
      enableSorting: false,
      cell: ({ row }) => {
        const product = row.original.products as unknown as { name: string; barcode: string } | null;
        return <span className="text-xs font-mono text-gray-500">{product?.barcode ?? '-'}</span>;
      },
    },
    {
      accessorKey: 'quantity',
      header: () => <span className="flex justify-center">수량</span>,
      size: 70,
      enableSorting: false,
      cell: ({ row }) => <div className="text-center">{row.original.quantity}</div>,
    },
    {
      accessorKey: 'unit_price',
      header: () => <span className="flex justify-center">단가</span>,
      size: 100,
      enableSorting: false,
      cell: ({ row }) => <div className="text-center text-sm">{row.original.unit_price?.toLocaleString() ?? '-'}</div>,
    },
    {
      id: 'amount',
      header: () => <span className="flex justify-center">금액</span>,
      size: 110,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-center text-sm font-medium">
          {((row.original.quantity ?? 0) * (row.original.unit_price ?? 0)).toLocaleString()}
        </div>
      ),
    },
  ], []);

  const l3AssignedColumns = useMemo<ColumnDef<AssignedSerial, unknown>[]>(() => [
    {
      id: 'product_name',
      header: '제품',
      enableSorting: false,
      cell: ({ row }) => <span className="text-sm">{row.original.products?.name ?? '-'}</span>,
    },
    {
      id: 'barcode',
      header: '바코드',
      enableSorting: false,
      cell: ({ row }) => <span className="text-xs font-mono">{row.original.inventory_items?.unit_barcode ?? '-'}</span>,
    },
    {
      id: 'manufacturer_serial',
      header: '제조사 시리얼',
      enableSorting: false,
      cell: ({ row }) => <span className="text-xs font-mono text-gray-500">{row.original.inventory_items?.manufacturer_serial ?? '-'}</span>,
    },
    {
      id: 'assignment',
      header: () => <span className="flex justify-end">배정</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <Badge variant="outline" className="text-[10px]">
            {row.original.assigned_by === 'auto' ? 'FIFO' : row.original.assigned_by ?? '-'}
          </Badge>
        </div>
      ),
    },
  ], []);

  function buildSerialColumns(serialMode: string, productId: string): ColumnDef<SerialRow, unknown>[] {
    return [
      {
        id: 'checkbox',
        size: 32,
        enableSorting: false,
        header: ({ table }) => {
          const allRows = table.getRowModel().rows;
          const inventoryIds = allRows.map((r) => r.original.inventoryItemId).filter(Boolean) as string[];
          const allChecked = inventoryIds.length > 0 && inventoryIds.every((id) => checkedSerials.has(id));
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={allChecked}
                disabled={isPending}
                onCheckedChange={(v) => {
                  setCheckedSerials((prev) => {
                    const next = new Set(prev);
                    if (v) { inventoryIds.forEach((id) => next.add(id)); }
                    else { inventoryIds.forEach((id) => next.delete(id)); }
                    return next;
                  });
                }}
              />
            </div>
          );
        },
        cell: ({ row }) => {
          const r = row.original;
          const inventoryId = r.inventoryItemId;
          if (!inventoryId) return null;
          const isChecked = checkedSerials.has(inventoryId);
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isChecked}
                disabled={isPending}
                onCheckedChange={() => {
                  setCheckedSerials((prev) => {
                    const next = new Set(prev);
                    if (isChecked) next.delete(inventoryId);
                    else next.add(inventoryId);
                    return next;
                  });
                }}
              />
            </div>
          );
        },
      },
      {
        id: 'serial_number',
        header: '#',
        enableSorting: false,
        cell: ({ row }) => <span className="text-gray-500">{row.original.serial_number ?? '-'}</span>,
      },
      {
        id: 'manufacturer_serial',
        header: '시리얼',
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono">{row.original.manufacturer_serial ?? <span className="text-gray-300">—</span>}</span>,
      },
      {
        id: 'unit_barcode',
        header: '개별 바코드',
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono">{row.original.unit_barcode ?? (row.original.kind === 'assigned' && !row.original.unit_barcode ? `수량 ${row.original.quantity}개` : <span className="text-gray-300">—</span>)}</span>,
      },
      {
        id: 'lot',
        header: 'LOT',
        enableSorting: false,
        cell: ({ row }) => <span className="text-gray-500">{row.original.lot_number ?? '-'}</span>,
      },
    ];
  }

  function buildSerialRows(productAssigned: AssignedSerial[], avail: AvailableSerial[]): SerialRow[] {
    const assigned: SerialRow[] = productAssigned.map((a) => ({
      id: `assigned-${a.id}`,
      originalId: a.id,
      inventoryItemId: a.inventory_items?.id ?? null,
      kind: 'assigned' as const,
      serial_number: a.inventory_items?.serial_number ?? null,
      unit_barcode: a.inventory_items?.unit_barcode ?? null,
      manufacturer_serial: a.inventory_items?.manufacturer_serial ?? null,
      lot_number: null,
      assigned_by: a.assigned_by,
      quantity: a.quantity,
    }));
    const available: SerialRow[] = avail.map((s) => ({
      id: s.id,
      originalId: s.id,
      inventoryItemId: s.id,
      kind: 'available' as const,
      serial_number: s.serial_number,
      unit_barcode: s.unit_barcode,
      manufacturer_serial: s.manufacturer_serial,
      lot_number: (s.product_lots as unknown as { lot_number: string } | null)?.lot_number ?? null,
      assigned_by: null,
      quantity: 1,
    }));
    return [...assigned, ...available];
  }

  // ── 시리얼 관련 상태 (shipment 탭) ──
  const [shipLoading, setShipLoading] = useState(false);
  const [shipOrderItems, setShipOrderItems] = useState<ShipOrderItem[]>([]);
  const [shipSerial, setShipSerial] = useState<{ level: SerialLevel; shipmentId: string } | null>(null);
  const [assignedSerials, setAssignedSerials] = useState<AssignedSerial[]>([]);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [availableSerials, setAvailableSerials] = useState<AvailableSerial[]>([]);
  const [selectedSerials, setSelectedSerials] = useState<Set<string>>(new Set());
  const [loadingSerials, setLoadingSerials] = useState(false);
  const [inputMode, setInputMode] = useState<'select' | 'text'>('select');
  const [serialText, setSerialText] = useState('');
  const [serialSearch, setSerialSearch] = useState('');
  const [matchText, setMatchText] = useState('');
  const [selectionMode, setSelectionMode] = useState<'assigned' | 'unassigned' | null>(null);
  // 배치 모드: 로컬 체크 상태 (inventory_item ID 기준)
  const [checkedSerials, setCheckedSerials] = useState<Set<string>>(new Set());
  // 원본 배정 상태 (diff 계산용, inventory_item ID 기준)
  const [originalChecked, setOriginalChecked] = useState<Set<string>>(new Set());

  const loadShipmentData = useCallback(async () => {
    if (!shipment) return;
    setShipLoading(true);
    try {
      const detail = await getShipmentDetail(order.id);
      if (!detail) return;
      const items = (detail.order_items ?? []) as unknown as ShipOrderItem[];
      const ship = Array.isArray(detail.shipments) ? detail.shipments[0] : (detail.shipments as unknown as { id: string; serial_level: string; memo: string | null });
      setShipOrderItems(items);
      if (ship) {
        setShipSerial({ level: (ship.serial_level as SerialLevel) ?? 'L0', shipmentId: ship.id });
        const assigned = await getShipmentSerials(ship.id);
        setAssignedSerials(assigned as unknown as AssignedSerial[]);
      }
    } catch {
      toast.error('출고 정보 조회 실패');
    } finally {
      setShipLoading(false);
    }
  }, [order.id, shipment]);

  useEffect(() => {
    if (activeTab === 'shipment' && shipment) {
      loadShipmentData();
    }
  }, [activeTab, shipment, loadShipmentData]);

  // ── 핸들러 ──

  function handleAction(action: () => Promise<{ error?: string; success?: boolean }>, successMsg: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else { toast.success(successMsg); router.refresh(); }
    });
  }

  function handleConfirm() {
    if (!confirm('발주를 확정하면 재고가 차감됩니다. 진행하시겠습니까?')) return;
    handleAction(() => confirmOrder(order.id), '발주가 확정되었습니다 (재고 차감 완료)');
  }

  function handleShip() { setShipDialogOpen(true); }

  function handleShipConfirm() {
    setShipDialogOpen(false);
    startTransition(async () => {
      const result = await shipOrder(order.id, { serial_level: shipSerialLevel });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('출고 지시가 완료되었습니다');
        router.refresh();
        setActiveTab('shipment');
      }
    });
  }

  function handleComplete() {
    handleAction(() => completeOrder(order.id), '배송이 완료 처리되었습니다');
  }

  function handleCancel() {
    const msg = order.status === 'confirmed'
      ? '확정된 발주를 취소하면 재고가 복원됩니다. 취소하시겠습니까?'
      : '발주를 취소하시겠습니까?';
    if (!confirm(msg)) return;
    handleAction(() => cancelOrder(order.id), '발주가 취소되었습니다');
  }

  function handleCreateQuotation() {
    startTransition(async () => {
      const result = await createQuotationFromOrder(order.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`견적서 ${result.number} 초안이 생성되었습니다`);
        router.push(`/quotations/${result.quotationId}`);
      }
    });
  }

  function handleSendQuotationEmail(quotationId: string) {
    if (!confirm('선택하신 내용으로 견적서를 발송하시겠습니까?')) return;
    startTransition(async () => {
      const result = await sendQuotationEmail(quotationId);
      if (result.error) toast.error(result.error);
      else { toast.success(`견적서 ${result.number} 이메일 발송 완료`); router.refresh(); }
    });
  }

  function handleSendShipmentNotification() {
    startTransition(async () => {
      const result = await sendShipmentNotification(order.id);
      if (result.error) toast.error(result.error);
      else { toast.success('출하 알림 이메일을 발송했습니다'); router.refresh(); }
    });
  }

  function handleSaveItems() {
    const parsed = editItems.map((item) => ({
      product_id: item.product_id,
      quantity: parseInt(item.quantity, 10) || 0,
      unit_price: parseFloat(item.unit_price) || 0,
    }));
    if (parsed.some((i) => i.quantity < 1)) { toast.error('수량은 1 이상이어야 합니다'); return; }
    startTransition(async () => {
      const result = await updateOrderItems(order.id, parsed);
      if (result.error) toast.error(result.error);
      else { toast.success('발주 항목이 수정되었습니다 (견적서 동기화 완료)'); setDirty(false); router.refresh(); }
    });
  }

  // ── 시리얼 핸들러 ──

  async function handleLevelChange(newLevel: SerialLevel) {
    if (!shipSerial) return;
    if (shipSerial.level === newLevel) return;

    const countResult = await getShipmentSerialCount(shipSerial.shipmentId);
    if (countResult.error) { toast.error(countResult.error); return; }

    if ((countResult.count ?? 0) > 0) {
      const confirmed = confirm(`현재 ${countResult.count}건이 배정되어 있습니다.\n레벨을 변경하면 기존 배정이 모두 초기화됩니다.\n\n변경하시겠습니까?`);
      if (!confirmed) return;
    }

    startTransition(async () => {
      const result = await updateSerialLevel(shipSerial.shipmentId, newLevel);
      if (result.error) toast.error(result.error);
      else {
        const cleared = result.cleared ?? 0;
        toast.success(cleared > 0 ? `${newLevel} 변경 (${cleared}건 초기화)` : `${newLevel} 변경 완료`);
        // 레벨만 변경: 출고 품목은 유지, 시리얼 데이터만 갱신
        setShipSerial({ ...shipSerial, level: newLevel });
        const assigned = await getShipmentSerials(shipSerial.shipmentId);
        setAssignedSerials(assigned as unknown as AssignedSerial[]);
        setExpandedProduct(null);
        setSelectedSerials(new Set());
        setSelectionMode(null);
      }
    });
  }

  async function handleExpandProduct(productId: string) {
    if (expandedProduct === productId) { setExpandedProduct(null); return; }
    setExpandedProduct(productId);
    setSelectedSerials(new Set());
    setSelectionMode(null);
    setLoadingSerials(true);
    try {
      const serials = await getAvailableSerials(productId, 200);
      setAvailableSerials(serials as unknown as AvailableSerial[]);
      // 배치 모드: 현재 배정된 시리얼 ID로 초기 체크 상태 설정
      const productAssigned = assignedSerials.filter((a) => a.products?.id === productId);
      const assignedInventoryIds = new Set(
        productAssigned.map((a) => a.inventory_items?.id).filter((id): id is string => !!id),
      );
      setCheckedSerials(new Set(assignedInventoryIds));
      setOriginalChecked(new Set(assignedInventoryIds));
    } catch { toast.error('시리얼 조회 실패'); }
    finally { setLoadingSerials(false); }
  }

  function toggleSerial(serialId: string, mode: 'assigned' | 'unassigned') {
    setSelectedSerials((prev) => {
      const next = new Set(prev);
      if (next.has(serialId)) {
        next.delete(serialId);
        if (next.size === 0) setSelectionMode(null);
      } else {
        // 처음 선택 시 모드 설정, 다른 모드면 무시
        if (selectionMode && selectionMode !== mode) return prev;
        next.add(serialId);
        if (!selectionMode) setSelectionMode(mode);
      }
      return next;
    });
  }

  function handleAssignSelected(productId: string, serialIds?: string[]) {
    const ids = serialIds ?? Array.from(selectedSerials);
    if (!shipSerial || ids.length === 0) return;

    // 낙관적 업데이트: available → assigned 로컬 이동
    const movingSerials = availableSerials.filter((s) => ids.includes(s.id));
    const newAssigned: AssignedSerial[] = movingSerials.map((s) => ({
      id: `optimistic-${s.id}`,
      quantity: 1,
      assigned_by: 'admin',
      created_at: new Date().toISOString(),
      inventory_items: {
        id: s.id,
        serial_number: s.serial_number,
        unit_barcode: s.unit_barcode,
        manufacturer_serial: s.manufacturer_serial,
      },
      products: shipOrderItems.find((i) => {
        const p = i.products as unknown as { id: string; name: string; barcode: string; serial_mode: string } | null;
        return p?.id === productId;
      })?.products as unknown as { id: string; name: string; barcode: string; serial_mode: string } | null,
    }));
    setAssignedSerials((prev) => [...prev, ...newAssigned]);
    setAvailableSerials((prev) => prev.filter((s) => !ids.includes(s.id)));
    setSelectedSerials(new Set());
    setSelectionMode(null);

    // 서버 동기화 (백그라운드)
    startTransition(async () => {
      const items = ids.map((inventory_item_id) => ({ inventory_item_id, product_id: productId }));
      const result = await assignSerials(shipSerial.shipmentId, items);
      if (result.error) {
        toast.error(result.error);
        // 롤백
        await loadShipmentData();
        if (expandedProduct) {
          const serials = await getAvailableSerials(expandedProduct, 200);
          setAvailableSerials(serials as unknown as AvailableSerial[]);
        }
      }
    });
  }

  function handleAutoAssign(productId: string, quantity: number) {
    if (!shipSerial) return;
    startTransition(async () => {
      const result = await autoAssignSerials(shipSerial.shipmentId, productId, quantity);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`FIFO ${result.count}건 자동 배정`);
        await loadShipmentData();
        if (expandedProduct === productId) {
          const serials = await getAvailableSerials(productId, 200);
          setAvailableSerials(serials as unknown as AvailableSerial[]);
        }
      }
    });
  }

  // 배치 모드: diff 계산 후 일괄 저장
  function handleBatchSave(productId: string) {
    if (!shipSerial) return;

    const toAssign = [...checkedSerials].filter((id) => !originalChecked.has(id));
    const toUnassign = [...originalChecked].filter((id) => !checkedSerials.has(id));

    if (toAssign.length === 0 && toUnassign.length === 0) {
      toast.info('변경사항이 없습니다');
      return;
    }

    startTransition(async () => {
      let assignCount = 0;
      let unassignCount = 0;

      // 새로 체크된 항목 배정
      if (toAssign.length > 0) {
        const items = toAssign.map((inventory_item_id) => ({ inventory_item_id, product_id: productId }));
        const result = await assignSerials(shipSerial.shipmentId, items);
        if (result.error) { toast.error(result.error); return; }
        assignCount = toAssign.length;
      }

      // 체크 해제된 항목 배정 해제
      if (toUnassign.length > 0) {
        for (const inventoryId of toUnassign) {
          const assigned = assignedSerials.find((a) => a.inventory_items?.id === inventoryId);
          if (assigned) {
            const result = await unassignSerial(assigned.id);
            if (!result.error) unassignCount++;
          }
        }
      }

      const parts: string[] = [];
      if (assignCount > 0) parts.push(`${assignCount}건 배정`);
      if (unassignCount > 0) parts.push(`${unassignCount}건 해제`);
      toast.success(parts.join(', '));

      // 로컬 상태만 갱신 (전체 리렌더링 방지)
      const freshAssigned = await getShipmentSerials(shipSerial.shipmentId);
      setAssignedSerials(freshAssigned as unknown as AssignedSerial[]);
      const freshAvailable = await getAvailableSerials(productId, 200);
      setAvailableSerials(freshAvailable as unknown as AvailableSerial[]);

      // 체크 상태를 원본으로 설정
      setOriginalChecked(new Set(checkedSerials));
    });
  }

  function handleAssignQuantity(productId: string, quantity: number) {
    if (!shipSerial) return;
    startTransition(async () => {
      const result = await assignQuantityOnly(shipSerial.shipmentId, productId, quantity);
      if (result.error) toast.error(result.error);
      else { toast.success('수량 배정 완료'); await loadShipmentData(); }
    });
  }

  function handleTextAssign(productId: string) {
    if (!shipSerial || !serialText.trim()) return;
    const lines = serialText.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('시리얼을 입력하세요'); return; }
    startTransition(async () => {
      const result = await assignSerialsByText(shipSerial.shipmentId, productId, lines);
      if (result.error) { toast.error(result.error); }
      else {
        let msg = `${result.assigned}건 배정 완료`;
        if (result.skipped && result.skipped > 0) msg += `, ${result.skipped}건 이미 배정됨`;
        if (result.notFound && result.notFound.length > 0) msg += `\n미발견: ${result.notFound.join(', ')}`;
        toast.success(msg);
        setSerialText('');
        await loadShipmentData();
        if (expandedProduct === productId) {
          const serials = await getAvailableSerials(productId, 200);
          setAvailableSerials(serials as unknown as AvailableSerial[]);
        }
      }
    });
  }

  function handleUnassign(shipmentSerialId: string) {
    // 낙관적 업데이트: assigned → available 로컬 이동
    const removedAssigned = assignedSerials.find((a) => a.id === shipmentSerialId);
    if (removedAssigned?.inventory_items) {
      const inv = removedAssigned.inventory_items;
      setAvailableSerials((prev) => [...prev, {
        id: inv.id,
        serial_number: inv.serial_number,
        unit_barcode: inv.unit_barcode,
        manufacturer_serial: inv.manufacturer_serial,
        status: 'in_stock',
        product_lots: null,
      }]);
    }
    setAssignedSerials((prev) => prev.filter((a) => a.id !== shipmentSerialId));

    // 서버 동기화 (백그라운드)
    startTransition(async () => {
      const result = await unassignSerial(shipmentSerialId);
      if (result.error) {
        toast.error(result.error);
        // 롤백
        await loadShipmentData();
        if (expandedProduct) {
          const serials = await getAvailableSerials(expandedProduct, 200);
          setAvailableSerials(serials as unknown as AvailableSerial[]);
        }
      }
    });
  }

  function handleBatchUnassign() {
    if (selectionMode !== 'assigned' || selectedSerials.size === 0) return;
    startTransition(async () => {
      let count = 0;
      for (const id of selectedSerials) {
        const result = await unassignSerial(id);
        if (!result.error) count++;
      }
      toast.success(`${count}건 배정 해제`);
      setSelectedSerials(new Set());
      setSelectionMode(null);
      await loadShipmentData();
      if (expandedProduct) {
        const serials = await getAvailableSerials(expandedProduct, 200);
        setAvailableSerials(serials as unknown as AvailableSerial[]);
      }
    });
  }

  function handleMatchSerials() {
    if (!shipSerial || !matchText.trim()) return;
    const lines = matchText.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('시리얼을 입력하세요'); return; }
    startTransition(async () => {
      const result = await matchSerialsAcrossProducts(shipSerial.shipmentId, lines);
      if (result.error) { toast.error(result.error); }
      else {
        let msg = `${result.assigned}건 매칭 완료`;
        if (result.skipped && result.skipped > 0) msg += `, ${result.skipped}건 이미 배정됨`;
        if (result.notFound && result.notFound.length > 0) msg += `\n미발견: ${result.notFound.join(', ')}`;
        toast.success(msg);
        setMatchText('');
        await loadShipmentData();
      }
    });
  }

  function getAssignedCountForProduct(productId: string) {
    return assignedSerials
      .filter((a) => a.products?.id === productId)
      .reduce((sum, a) => sum + a.quantity, 0);
  }

  // ── 프로그레스바 클릭 가능 여부 ──
  function canClickStep(stepIdx: number): boolean {
    if (order.status === 'cancelled') return false;
    return stepIdx <= currentStepIdx;
  }

  function handleStepClick(stepIdx: number) {
    if (!canClickStep(stepIdx)) return;
    const step = STATUS_STEPS[stepIdx];
    setActiveTab(step.tab);
  }

  // ── 렌더 ──

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/orders')}>
            <ArrowLeft size={18} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold truncate">
              {order.companies?.name ?? '-'} 발주
              {order.order_number && (
                <span className="ml-2 text-sm font-mono font-normal text-gray-500">{order.order_number}</span>
              )}
            </h1>
            <p className="text-xs text-gray-400">{dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}</p>
          </div>
          <Badge variant={statusVariant[order.status]} className="ml-1 shrink-0">
            {statusLabel[order.status]}
          </Badge>
        </div>

        {/* 상태별 액션 버튼 */}
        <div className="flex items-center gap-2 pl-10 sm:pl-0">
          <ShareToChat
            entityType="order"
            entityId={order.id}
            label={order.order_number ?? `${order.companies?.name ?? ''} 발주`}
          />
          {order.status === 'pending' && (
            <>
              <Button size="sm" onClick={handleConfirm} disabled={isPending}>
                <CheckCircle size={14} /> 발주 확정
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={isPending} className="text-red-500 hover:text-red-600">
                <XCircle size={14} /> 취소
              </Button>
            </>
          )}
          {order.status === 'confirmed' && (
            <>
              <Button size="sm" onClick={handleShip} disabled={isPending}>
                <Truck size={14} /> 출고 지시
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={isPending} className="text-red-500 hover:text-red-600">
                <XCircle size={14} /> 취소
              </Button>
            </>
          )}
          {order.status === 'packed' && (
            <Button size="sm" onClick={handleComplete} disabled={isPending}>
              <PackageCheck size={14} /> 출하 완료
            </Button>
          )}
          {order.status === 'completed' && (
            notified ? (
              <Button size="sm" variant="outline" disabled className="text-green-600">
                <MailCheck size={14} /> 발송 완료
              </Button>
            ) : (
              <Button size="sm" onClick={handleSendShipmentNotification} disabled={isPending}>
                <Mail size={14} /> 출하알림 발송
              </Button>
            )
          )}
        </div>
      </div>

      {/* 승인 워크플로우 — 확정 대기중일 때만 의미 있음 */}
      {order.status === 'pending' && (
        <ApprovalPanel
          entityType="order"
          entityId={order.id}
          entityLabel={order.order_number ?? `${order.companies?.name ?? ''} 발주`}
          onChange={() => router.refresh()}
        />
      )}

      {/* 프로그레스바 (클릭 가능 탭) */}
      <div className="flex items-center gap-0 text-xs">
        {STATUS_STEPS.map((step, i) => {
          const reached = currentStepIdx >= i;
          const isCancelled = order.status === 'cancelled';
          const isActiveTab = activeTab === step.tab;
          const clickable = canClickStep(i) && !isCancelled;

          return (
            <div key={step.status} className="flex items-center">
              {i > 0 && <div className={`w-8 h-0.5 ${reached && !isCancelled ? 'bg-gray-900' : 'bg-gray-200'}`} />}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => handleStepClick(i)}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  reached && !isCancelled
                    ? isActiveTab
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-gray-700 text-gray-200 border-gray-700 hover:bg-gray-800 cursor-pointer'
                    : 'bg-white text-gray-400 border-gray-200'
                } ${!clickable ? 'cursor-default' : ''}`}
              >
                {step.label}
              </button>
            </div>
          );
        })}
        {order.status === 'cancelled' && (
          <>
            <div className="w-8 h-0.5 bg-red-200" />
            <div className="px-3 py-1 rounded-full border bg-red-100 text-red-600 border-red-200">
              취소
            </div>
          </>
        )}
      </div>

      {/* 확정일 */}
      {order.confirmed_at && (
        <p className="text-xs text-gray-400">
          확정일: {dayjs(order.confirmed_at).format('YYYY-MM-DD HH:mm')}
        </p>
      )}

      {/* ═══════════ 탭 컨텐츠 ═══════════ */}

      {activeTab === 'order' && (
        <>
          {/* 담당자 정보 */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">수주 담당자</CardTitle></CardHeader>
              <CardContent>
                {order.confirmed_by ? (
                  <div className="text-sm">
                    <p className="font-medium">{order.confirmed_by.split('@')[0]}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{order.confirmed_by}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">확정 시 자동 배정</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">거래처 발주 담당자</CardTitle></CardHeader>
              <CardContent>
                {order.companies && (order.companies.contact_name || order.companies.contact_phone || order.companies.contact_email) ? (
                  <div className="flex gap-6 text-sm">
                    {order.companies.contact_name && (
                      <div>
                        <p className="text-xs text-gray-500">담당자</p>
                        <p className="font-medium">
                          {order.companies.contact_name}
                          {order.companies.contact_position && <span className="text-gray-400 ml-1">({order.companies.contact_position})</span>}
                        </p>
                      </div>
                    )}
                    {order.companies.contact_phone && (
                      <div><p className="text-xs text-gray-500">연락처</p><p className="font-medium">{order.companies.contact_phone}</p></div>
                    )}
                    {order.companies.contact_email && (
                      <div><p className="text-xs text-gray-500">이메일</p><p className="font-medium">{order.companies.contact_email}</p></div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">담당자 정보 없음</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 발주 항목 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">발주 항목</CardTitle>
                {editable && dirty && (
                  <Button onClick={handleSaveItems} disabled={isPending} size="sm" className="h-8 gap-1">
                    <Save size={14} /> 변경사항 저장
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable columns={orderItemColumns} data={editItems} emptyMessage="발주 항목이 없습니다" />
              <div className="px-4 py-3 border-t space-y-1 text-right">
                <div className="flex justify-between text-sm text-gray-500"><span>공급가액</span><span>₩{subtotal.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm text-gray-500"><span>부가세 (10%)</span><span>₩{tax.toLocaleString()}</span></div>
                <div className="flex justify-between text-base font-bold"><span>합계</span><span>₩{(subtotal + tax).toLocaleString()}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* 요청사항 */}
          <Card className={order.notes ? 'border-amber-300 bg-amber-50' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <MessageSquareText size={16} className={order.notes ? 'text-amber-600' : 'text-gray-400'} />
                <CardTitle className="text-base">요청사항</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {order.notes ? (
                <p className="text-sm whitespace-pre-wrap text-amber-900">{order.notes}</p>
              ) : (
                <p className="text-sm text-gray-400">요청사항 없음</p>
              )}
            </CardContent>
          </Card>

          {/* 견적서 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">견적서 {quotations.length > 0 && <span className="text-gray-400 font-normal">({quotations.length})</span>}</CardTitle>
                {order.status !== 'cancelled' && (
                  <Button size="sm" variant="outline" onClick={handleCreateQuotation} disabled={isPending} className="h-8 text-xs">
                    <Plus size={14} /> 견적서 작성
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {quotations.length > 0 ? (
                <div className="space-y-3">
                  {quotations.map((q) => {
                    const qStatusLabel = q.status === 'confirmed' ? '확정' : q.status === 'sent' ? '발송' : '초안';
                    const qStatusVariant = q.status === 'confirmed' ? 'default' as const : q.status === 'sent' ? 'secondary' as const : 'outline' as const;
                    return (
                      <div key={q.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                        <div className="flex items-center gap-3">
                          <button onClick={() => router.push(`/quotations/${q.id}`)} className="text-sm font-medium font-mono text-blue-600 hover:underline">{q.number}</button>
                          <Badge variant={qStatusVariant} className="text-xs">{qStatusLabel}</Badge>
                          <span className="text-xs text-gray-400">{dayjs(q.issued_at).format('YYYY-MM-DD HH:mm')}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <a href={`/api/quotations/${q.id}/pdf`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="outline" className="h-7 text-xs"><FileDown size={12} /> PDF 다운로드</Button>
                          </a>
                          {order.status !== 'cancelled' && q.status !== 'confirmed' && (
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleSendQuotationEmail(q.id)} disabled={isPending}>
                              <Send size={12} /> 이메일 발송
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {quotationSummary && (
                    <div className="mt-3 pt-3 border-t border-dashed space-y-1">
                      <p className="text-xs text-gray-500 mb-2">최신 견적 합계 <span className="font-mono text-gray-400">({latestQuotation!.number})</span></p>
                      <div className="flex justify-between text-sm text-gray-500"><span>제품 소계</span><span>₩{quotationSummary.productTotal.toLocaleString()}</span></div>
                      {quotationSummary.customTotal > 0 && <div className="flex justify-between text-sm text-gray-500"><span>기타 비용</span><span>₩{quotationSummary.customTotal.toLocaleString()}</span></div>}
                      {quotationSummary.discountTotal < 0 && <div className="flex justify-between text-sm text-red-500"><span>할인</span><span>-₩{Math.abs(quotationSummary.discountTotal).toLocaleString()}</span></div>}
                      <div className="flex justify-between text-sm text-gray-500"><span>부가세 (10%)</span><span>₩{quotationSummary.taxAmount.toLocaleString()}</span></div>
                      <div className="flex justify-between text-base font-bold pt-1 border-t"><span>청구 합계</span><span>₩{quotationSummary.total.toLocaleString()}</span></div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">견적서를 작성하면 발주 항목이 복사되어 초안이 생성됩니다.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'shipment' && (
        <>
          {!shipment ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-gray-500">출고 지시 전입니다</p>
                <p className="text-xs text-gray-400 mt-1">발주를 확정한 후 출고 지시를 하세요</p>
              </CardContent>
            </Card>
          ) : shipLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 size={24} className="animate-spin text-gray-400 mx-auto" />
                <p className="text-sm text-gray-500 mt-2">로딩 중...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* 출고 품목 테이블 (모든 레벨 공통) */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package size={16} className="text-gray-500" />
                      <CardTitle className="text-base">출고 품목</CardTitle>
                    </div>
                    <select
                      value={shipSerial?.level ?? 'L0'}
                      disabled={isPending}
                      onChange={(e) => handleLevelChange(e.target.value as SerialLevel)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
                    >
                      <option value="L0">L0 — 시리얼 미추적</option>
                      <option value="L1">L1 — 출고후 매칭</option>
                      <option value="L2">L2 — 출고목록 지정</option>
                      <option value="L3">L3 — 개별지정</option>
                    </select>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable columns={shipmentItemColumns} data={shipOrderItems} emptyMessage="출고 품목이 없습니다" />
                </CardContent>
              </Card>

              {/* L3: 물류팀 입력 현황 (뷰 전용) */}
              {shipSerial?.level === 'L3' && assignedSerials.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      물류팀 입력 현황 ({assignedSerials.length}건)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <DataTable columns={l3AssignedColumns} data={assignedSerials} emptyMessage="배정된 시리얼이 없습니다" />
                  </CardContent>
                </Card>
              )}

              {/* L1/L2: 시리얼 매칭 & 배정 */}
              {(shipSerial?.level === 'L1' || shipSerial?.level === 'L2') && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ListChecks size={16} className="text-gray-500" />
                        <CardTitle className="text-base">출고 시리얼 배정</CardTitle>
                        <span className="text-xs text-gray-400">품목별 출고할 시리얼을 선택하세요</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 divide-y">
                  {shipOrderItems.map((item) => {
                    const product = item.products as unknown as ShipProduct | null;
                    if (!product) return null;

                    const serialMode = product.serial_mode ?? 'pool';
                    const isExpanded = expandedProduct === product.id;
                    const assignedCount = getAssignedCountForProduct(product.id);
                    const remaining = item.quantity - assignedCount;
                    const isComplete = remaining <= 0;
                    const productAssigned = assignedSerials.filter((a) => a.products?.id === product.id);

                    return (
                      <div key={item.id} className={isComplete ? 'bg-green-50/30' : ''}>
                        {/* 제품 헤더 */}
                        <button
                          type="button"
                          onClick={() => serialMode !== 'none' ? handleExpandProduct(product.id) : undefined}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-gray-900">{product.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {serialMode === 'none' ? '수량관리' : serialMode === 'pool' ? '자체시리얼' : '제조사시리얼'}
                            </Badge>
                            <span className="text-sm text-gray-500">주문: {item.quantity}개</span>
                            {isComplete && <Check size={16} className="text-green-500" />}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              배정 {assignedCount}/{item.quantity}
                            </span>
                            {serialMode !== 'none' && (isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                          </div>
                        </button>

                        {/* none 모드: 수량 배정 */}
                        {serialMode === 'none' && !isComplete && (
                          <div className="px-4 py-3 border-t bg-gray-50/50">
                            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={isPending} onClick={() => handleAssignQuantity(product.id, item.quantity)}>
                              <Check size={12} /> 수량 배정 ({item.quantity}개)
                            </Button>
                          </div>
                        )}

                        {/* 시리얼 배정 영역 */}
                        {isExpanded && serialMode !== 'none' && (
                          <div className="border-t space-y-0">
                            {/* 탭 + 검색 */}
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-50/50">
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => setInputMode('select')} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${inputMode === 'select' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                                  목록 선택
                                </button>
                                {(() => {
                                  const localCheckedCount = checkedSerials.size;
                                  const localRemaining = item.quantity - localCheckedCount;
                                  return localRemaining > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const sorted = [...availableSerials].sort((a, b) => a.serial_number - b.serial_number);
                                      const unchecked = sorted.filter((s) => !checkedSerials.has(s.id));
                                      const toCheck = unchecked.slice(0, localRemaining);
                                      setCheckedSerials((prev) => {
                                        const next = new Set(prev);
                                        toCheck.forEach((s) => next.add(s.id));
                                        return next;
                                      });
                                    }}
                                    disabled={isPending}
                                    className="px-3 py-1 rounded text-xs font-medium transition-colors text-gray-400 hover:text-gray-600 disabled:opacity-50"
                                  >
                                    FIFO
                                  </button>
                                  ) : null;
                                })()}
                                <button type="button" onClick={() => setInputMode('text')} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${inputMode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                                  직접 입력
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                {inputMode === 'select' && (
                                  <div className="relative">
                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                      type="text"
                                      value={serialSearch}
                                      onChange={(e) => setSerialSearch(e.target.value)}
                                      placeholder="검색"
                                      className="w-32 pl-7 pr-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                                    />
                                  </div>
                                )}
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400" disabled={loadingSerials} onClick={() => handleExpandProduct(product.id)}>
                                  <RefreshCw size={12} className={loadingSerials ? 'animate-spin' : ''} />
                                </Button>
                              </div>
                            </div>

                            {inputMode === 'select' ? (
                              <>
                                {loadingSerials ? (
                                  <div className="py-4 text-center"><Loader2 size={16} className="animate-spin text-gray-400 mx-auto" /></div>
                                ) : (
                                  <div className="max-h-72 overflow-y-auto text-xs">
                                    <DataTable
                                      columns={buildSerialColumns(serialMode, product.id)}
                                      data={buildSerialRows(productAssigned, availableSerials)}
                                      globalFilter={serialSearch}
                                      emptyMessage={serialSearch ? '검색 결과 없음' : '가용 시리얼 없음'}
                                    />
                                  </div>
                                )}
                                {/* 배치 저장 바 */}
                                {(() => {
                                  const newlyChecked = [...checkedSerials].filter((id) => !originalChecked.has(id)).length;
                                  const newlyUnchecked = [...originalChecked].filter((id) => !checkedSerials.has(id)).length;
                                  const hasChanges = newlyChecked > 0 || newlyUnchecked > 0;
                                  if (!hasChanges) return null;
                                  return (
                                    <div className="px-4 py-2 border-t bg-blue-50/50 flex items-center justify-between">
                                      <span className="text-xs text-blue-600">
                                        {newlyChecked > 0 && `+${newlyChecked}건 배정`}
                                        {newlyChecked > 0 && newlyUnchecked > 0 && ', '}
                                        {newlyUnchecked > 0 && `-${newlyUnchecked}건 해제`}
                                      </span>
                                      <Button size="sm" className="h-7 text-xs" disabled={isPending} onClick={() => handleBatchSave(product.id)}>
                                        <Save size={12} /> 저장
                                      </Button>
                                    </div>
                                  );
                                })()}
                              </>
                            ) : (
                              <div className="px-4 py-3 space-y-2">
                                <p className="text-xs text-gray-500">제조사 시리얼 또는 개별 바코드를 입력하세요 (줄바꿈 또는 쉼표 구분)</p>
                                <textarea
                                  value={serialText}
                                  onChange={(e) => setSerialText(e.target.value)}
                                  placeholder={'SN-001\nSN-002\nSN-003'}
                                  className="w-full h-28 border rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
                                />
                                <div className="flex items-center justify-between">
                                  {(() => {
                                    const inputCount = serialText.trim() ? serialText.split(/[\n,]+/).filter((l) => l.trim()).length : 0;
                                    const isOverOrUnder = inputCount > 0 && inputCount !== remaining;
                                    return (
                                      <span className={`text-xs ${inputCount === 0 ? 'text-gray-400' : isOverOrUnder ? 'text-amber-600' : 'text-gray-400'}`}>
                                        {inputCount > 0 ? `${inputCount}건 입력됨 (잔여 ${remaining}개)` : ''}
                                      </span>
                                    );
                                  })()}
                                  <Button size="sm" className="h-7 text-xs" disabled={isPending || !serialText.trim()} onClick={() => handleTextAssign(product.id)}>
                                    <Check size={12} /> 배정
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </CardContent>

                  {/* 배정 요약 */}
                  <div className="px-4 py-2.5 border-t bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      총 배정: {assignedSerials.reduce((s, a) => s + a.quantity, 0)} /
                      {shipOrderItems.reduce((s, i) => s + i.quantity, 0)}개
                    </span>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* 레코드 스레드 — 이 수주에 붙는 대화 + 시스템 이벤트 + 역링크 */}
      <Card>
        <CardContent className="py-4">
          <RecordThread
            entityType="order"
            entityId={order.id}
            entityLabel={order.order_number ?? `수주 ${order.id.slice(0, 8)}`}
          />
        </CardContent>
      </Card>

      {/* 출고 지시 다이얼로그 */}
      {shipDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b">
              <h3 className="font-bold text-gray-900">출고 지시</h3>
              <p className="text-xs text-gray-500 mt-0.5">시리얼 추적 방식을 선택하세요</p>
            </div>
            <div className="px-6 py-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">시리얼 추적 레벨</label>
              <select
                value={shipSerialLevel}
                onChange={(e) => setShipSerialLevel(e.target.value as SerialLevel)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <option value="L0">L0 — 시리얼 미추적</option>
                <option value="L1">L1 — 출고후 매칭</option>
                <option value="L2">L2 — 출고목록 지정</option>
                <option value="L3">L3 — 개별지정 입력</option>
              </select>
            </div>
            <div className="px-6 py-4 border-t rounded-b-2xl flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShipDialogOpen(false)}>취소</Button>
              <Button size="sm" onClick={handleShipConfirm} disabled={isPending}><Truck size={14} /> 출고 지시</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
