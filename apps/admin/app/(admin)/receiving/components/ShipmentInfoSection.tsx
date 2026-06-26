'use client';

import { useState, useTransition } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { updateInboundShipment } from '@/actions/inboundShipments';
import { getShippingTypeLabel, getCustomsStatusLabel, SHIPPING_TYPES, CUSTOMS_STATUSES } from '@/lib/inboundStages';
import { toast } from 'sonner';

interface ShipmentData {
  id: string;
  shipping_type: string | null;
  bl_number: string | null;
  container_number: string | null;
  origin_country: string | null;
  carrier: string | null;
  tracking_number: string | null;
  vehicle_number: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  customs_status: string | null;
  customs_amount: number | null;
  customs_cleared_at: string | null;
  memo: string | null;
}

interface Props {
  shipment: ShipmentData;
  onRefresh: () => void;
}

interface FieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: { value: string; label: string }[];
}

const transportFields: FieldConfig[] = [
  {
    key: 'shipping_type',
    label: '운송 타입',
    type: 'select',
    options: [
      { value: '', label: '-' },
      ...SHIPPING_TYPES.map((t) => ({ value: t.key, label: t.label })),
    ],
  },
  { key: 'bl_number', label: 'B/L·AWB' },
  { key: 'container_number', label: '컨테이너' },
  { key: 'origin_country', label: '출발국' },
  { key: 'carrier', label: '운송사' },
  { key: 'tracking_number', label: '운송장' },
  { key: 'vehicle_number', label: '차량번호' },
  { key: 'estimated_arrival', label: 'ETA', type: 'date' },
  { key: 'actual_arrival', label: '실제 도착', type: 'date' },
];

const customsFields: FieldConfig[] = [
  {
    key: 'customs_status',
    label: '통관 상태',
    type: 'select',
    options: [
      { value: '', label: '-' },
      ...CUSTOMS_STATUSES.map((s) => ({ value: s.key, label: s.label })),
    ],
  },
  { key: 'customs_amount', label: '통관 비용', type: 'number' },
  { key: 'customs_cleared_at', label: '통관 완료일', type: 'date' },
];

function InfoBlock({
  title,
  fields,
  shipment,
  onRefresh,
}: {
  title: string;
  fields: FieldConfig[];
  shipment: ShipmentData;
  onRefresh: () => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isPending, startTransition] = useTransition();

  function startEdit(field: FieldConfig) {
    const val = shipment[field.key as keyof ShipmentData];
    setEditValue(val != null ? String(val) : '');
    setEditingField(field.key);
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue('');
  }

  function saveEdit(field: FieldConfig) {
    startTransition(async () => {
      const update: Record<string, unknown> = {};
      if (field.type === 'number') {
        update[field.key] = editValue ? parseFloat(editValue) : null;
      } else {
        update[field.key] = editValue || null;
      }

      const res = await updateInboundShipment(shipment.id, update);
      if (res.error) toast.error(res.error);
      else {
        cancelEdit();
        onRefresh();
      }
    });
  }

  function displayValue(field: FieldConfig, val: unknown): string | null {
    if (val == null || val === '') return null;
    if (field.key === 'shipping_type') return getShippingTypeLabel(String(val));
    if (field.key === 'customs_status') return getCustomsStatusLabel(String(val));
    if (field.type === 'number') return `₩${Number(val).toLocaleString()}`;
    return String(val);
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h4>
      <div className="space-y-1">
        {fields.map((field) => {
          const val = shipment[field.key as keyof ShipmentData];
          const display = displayValue(field, val);
          const isEditing = editingField === field.key;

          return (
            <div key={field.key} className="flex items-center gap-2 text-sm group min-h-[28px]">
              <span className="text-gray-500 w-20 shrink-0 text-xs">{field.label}</span>

              {isEditing ? (
                <div className="flex items-center gap-1 flex-1">
                  {field.type === 'select' ? (
                    <select
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="flex-1 h-7 rounded border px-2 text-xs"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type={field.type ?? 'text'}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(field); if (e.key === 'Escape') cancelEdit(); }}
                      className="h-7 text-xs flex-1"
                      autoFocus
                    />
                  )}
                  <button onClick={() => saveEdit(field)} disabled={isPending} className="text-green-600 hover:text-green-800">
                    <Check size={14} />
                  </button>
                  <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className={`text-xs truncate ${display ? 'text-gray-900' : 'text-gray-300 italic'}`}>
                    {display ?? '미입력'}
                  </span>
                  <button
                    onClick={() => startEdit(field)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity shrink-0"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ShipmentInfoSection({ shipment, onRefresh }: Props) {
  return (
    <div className="space-y-4">
      <InfoBlock title="운송 정보" fields={transportFields} shipment={shipment} onRefresh={onRefresh} />
      <InfoBlock title="통관 정보" fields={customsFields} shipment={shipment} onRefresh={onRefresh} />
    </div>
  );
}
