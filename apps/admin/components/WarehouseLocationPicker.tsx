'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getWarehousesForSelect, getLocationsForSelect } from '@/actions/warehouses';

interface WarehouseLocationPickerProps {
  warehouseId: string | null;
  locationId: string | null;
  onWarehouseChange: (id: string | null) => void;
  onLocationChange: (id: string | null) => void;
  /** 라벨 표시 여부 (기본 true) */
  showLabel?: boolean;
  /** 가로 배치 (기본 false = 세로) */
  horizontal?: boolean;
  /** 컴팩트 모드 — 높이 축소 */
  compact?: boolean;
}

interface WarehouseOption {
  id: string;
  name: string;
  code: string;
}

interface LocationOption {
  id: string;
  name: string;
  code: string;
  type: string;
  full_path: string | null;
  depth: number;
}

const TYPE_PREFIX: Record<string, string> = {
  zone: '',
  aisle: '  ',
  rack: '    ',
  level: '      ',
  bin: '        ',
};

export default function WarehouseLocationPicker({
  warehouseId,
  locationId,
  onWarehouseChange,
  onLocationChange,
  showLabel = true,
  horizontal = false,
  compact = false,
}: WarehouseLocationPickerProps) {
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  useEffect(() => {
    getWarehousesForSelect().then(setWarehouses);
  }, []);

  useEffect(() => {
    if (warehouseId) {
      getLocationsForSelect(warehouseId).then(setLocations);
    } else {
      setLocations([]);
    }
  }, [warehouseId]);

  const handleWarehouseChange = (value: string) => {
    const id = value === '__none__' ? null : value;
    onWarehouseChange(id);
    onLocationChange(null);
  };

  const handleLocationChange = (value: string) => {
    onLocationChange(value === '__none__' ? null : value);
  };

  const triggerClass = compact ? 'h-8 text-sm' : '';

  return (
    <div className={horizontal ? 'flex items-end gap-3' : 'space-y-3'}>
      <div className={horizontal ? 'flex-1' : ''}>
        {showLabel && <Label className="text-xs text-muted-foreground">창고</Label>}
        <Select value={warehouseId ?? '__none__'} onValueChange={handleWarehouseChange}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="창고 선택 (선택사항)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">미지정</SelectItem>
            {warehouses.map((wh) => (
              <SelectItem key={wh.id} value={wh.id}>
                <span className="font-mono text-xs mr-1.5">{wh.code}</span>
                {wh.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {warehouseId && locations.length > 0 && (
        <div className={horizontal ? 'flex-1' : ''}>
          {showLabel && <Label className="text-xs text-muted-foreground">로케이션</Label>}
          <Select value={locationId ?? '__none__'} onValueChange={handleLocationChange}>
            <SelectTrigger className={triggerClass}>
              <SelectValue placeholder="로케이션 선택 (선택사항)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">창고 전체 (미지정)</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  <span className="text-muted-foreground">{TYPE_PREFIX[loc.type] ?? ''}</span>
                  <span className="font-mono text-xs mr-1.5">{loc.code}</span>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
