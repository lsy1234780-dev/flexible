'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WarehouseLocationPicker from '@/components/WarehouseLocationPicker';
import type { Product, Category } from '@/types/database';

interface Props {
  product?: Product;
  categories?: Category[];
  initialBarcode?: string;
  onSubmit: (formData: FormData) => Promise<void>;
}

export default function ProductForm({ product, categories = [], initialBarcode, onSubmit }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [categoryId, setCategoryId] = useState<string>(product?.category_id ?? 'none');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    formData.set('category_id', categoryId === 'none' ? '' : categoryId);
    if (warehouseId) formData.set('warehouse_id', warehouseId);
    if (locationId) formData.set('location_id', locationId);
    await onSubmit(formData);
  }

  // 트리 depth 계산
  const catDepthMap = new Map<string, number>();
  function getDepth(cat: Category): number {
    if (catDepthMap.has(cat.id)) return catDepthMap.get(cat.id)!;
    if (!cat.parent_id) { catDepthMap.set(cat.id, 0); return 0; }
    const parent = categories.find(c => c.id === cat.parent_id);
    const d = parent ? getDepth(parent) + 1 : 0;
    catDepthMap.set(cat.id, d);
    return d;
  }
  categories.forEach(c => getDepth(c));

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">제품명</Label>
        <Input id="name" name="name" defaultValue={product?.name} placeholder="예) 제품명 A-001" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="barcode">바코드</Label>
        <Input
          id="barcode"
          name="barcode"
          defaultValue={product?.barcode ?? initialBarcode ?? ''}
          placeholder="예) 8801234567890"
          required
        />
      </div>

      {categories.length > 0 && (
        <div className="space-y-1.5">
          <Label>카테고리</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="카테고리 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {'　'.repeat(catDepthMap.get(cat.id) ?? 0)}{cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cost_price">원가 (원)</Label>
          <Input
            id="cost_price"
            name="cost_price"
            type="number"
            min={0}
            defaultValue={product?.cost_price ?? 0}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="base_price">기본단가 (원)</Label>
          <Input
            id="base_price"
            name="base_price"
            type="number"
            min={0}
            defaultValue={product?.base_price ?? 0}
            required
          />
        </div>
      </div>

      {!product && (
        <div className="space-y-1.5">
          <Label htmlFor="base_stock">초기재고 (개)</Label>
          <Input
            id="base_stock"
            name="base_stock"
            type="number"
            min={0}
            defaultValue={0}
            required
          />
        </div>
      )}

      {!product && (
        <WarehouseLocationPicker
          warehouseId={warehouseId}
          locationId={locationId}
          onWarehouseChange={setWarehouseId}
          onLocationChange={setLocationId}
          compact
        />
      )}

      {/* 규격 (가로 × 세로 × 높이) */}
      <div className="space-y-1.5">
        <Label>규격 (cm)</Label>
        <div className="grid grid-cols-3 gap-2">
          <Input
            name="width_cm"
            type="number"
            step="0.1"
            min={0}
            placeholder="가로"
            defaultValue={product?.width_cm ?? ''}
          />
          <Input
            name="height_cm"
            type="number"
            step="0.1"
            min={0}
            placeholder="세로"
            defaultValue={product?.height_cm ?? ''}
          />
          <Input
            name="depth_cm"
            type="number"
            step="0.1"
            min={0}
            placeholder="높이"
            defaultValue={product?.depth_cm ?? ''}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="weight_kg">무게 (kg)</Label>
        <Input
          id="weight_kg"
          name="weight_kg"
          type="number"
          step="0.01"
          min={0}
          placeholder="예) 1.5"
          defaultValue={product?.weight_kg ?? ''}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="image_url">대표 이미지 URL</Label>
        <Input
          id="image_url"
          name="image_url"
          type="url"
          placeholder="https://example.com/image.jpg"
          defaultValue={product?.image_url ?? ''}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">제품 소개</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          placeholder="제품에 대한 설명을 입력하세요"
          defaultValue={product?.description ?? ''}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="is_visible_default"
          name="is_visible_default"
          type="checkbox"
          value="true"
          defaultChecked={product?.is_visible_default ?? true}
          className="h-4 w-4 rounded border-gray-300"
        />
        <Label htmlFor="is_visible_default">B2B 포털 기본 노출</Label>
      </div>

      <Button type="submit" className="w-full">
        {product ? '저장' : '등록'}
      </Button>
    </form>
  );
}
