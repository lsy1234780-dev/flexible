'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Product {
  id: string;
  name: string;
  barcode: string;
  price: number;
  stock: number;
  image_url: string | null;
  description: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  weight_kg: number | null;
}

interface Props {
  products: Product[];
  isActive: boolean;
}

export default function CatalogClient({ products, isActive }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Product | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">제품 카탈로그</h1>
        {isActive && (
          <Link href="/orders/new">
            <Button size="sm">
              <ShoppingCart size={16} /> 발주 신청
            </Button>
          </Link>
        )}
      </div>

      {!isActive ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
          <p className="text-lg font-medium">승인 대기 중</p>
          <p className="text-sm mt-1">관리자 승인 후 제품 목록을 확인하실 수 있습니다</p>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
          노출된 제품이 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p)}
              className="rounded-lg border bg-white p-4 flex items-center justify-between text-left hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-12 h-12 object-contain rounded bg-gray-50"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-gray-50 flex items-center justify-center text-gray-300">
                    <Package size={20} />
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{p.barcode}</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    ₩{p.price.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                {p.stock === 0 ? (
                  <Badge variant="destructive">품절</Badge>
                ) : p.stock <= 10 ? (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                    재고 {p.stock}개
                  </Badge>
                ) : (
                  <Badge variant="secondary">재고 {p.stock}개</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 제품 상세 다이얼로그 */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* 이미지 */}
                {selected.image_url ? (
                  <div className="bg-gray-50 rounded-lg flex items-center justify-center p-4">
                    <img
                      src={selected.image_url}
                      alt={selected.name}
                      className="max-h-48 w-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg flex items-center justify-center p-8 text-gray-300">
                    <Package size={48} />
                  </div>
                )}

                {/* 스펙 그리드 */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">바코드</p>
                    <p className="font-mono font-medium mt-0.5">{selected.barcode}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">단가</p>
                    <p className="font-semibold text-lg mt-0.5">₩{selected.price.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">재고</p>
                    <p className={`font-semibold mt-0.5 ${selected.stock === 0 ? 'text-red-500' : ''}`}>
                      {selected.stock === 0 ? '품절' : `${selected.stock.toLocaleString()}개`}
                    </p>
                  </div>
                  {(selected.width_cm || selected.height_cm || selected.depth_cm) && (
                    <div>
                      <p className="text-xs text-gray-400">규격 (W x H x D)</p>
                      <p className="font-medium mt-0.5">
                        {[selected.width_cm, selected.height_cm, selected.depth_cm]
                          .map(v => v != null ? `${v}` : '-')
                          .join(' × ')}{' '}
                        <span className="text-gray-400">cm</span>
                      </p>
                    </div>
                  )}
                  {selected.weight_kg != null && (
                    <div>
                      <p className="text-xs text-gray-400">무게</p>
                      <p className="font-medium mt-0.5">
                        {selected.weight_kg} <span className="text-gray-400">kg</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* 설명 */}
                {selected.description && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">제품 소개</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {selected.description}
                    </p>
                  </div>
                )}

                {/* 발주 버튼 */}
                {selected.stock > 0 && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setSelected(null);
                      router.push(`/orders/new?product=${selected.id}`);
                    }}
                  >
                    <ShoppingCart size={16} /> 즉시 발주하기
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
