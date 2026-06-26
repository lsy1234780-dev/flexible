'use client';

import { useState, useMemo } from 'react';
import { PackageCheck, Truck, ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import dayjs from 'dayjs';

type InventoryItem = { kind: 'inventory'; id: string; created_at: string; type: 'in' | 'out'; quantity: number; memo: string | null; productName: string; barcode: string };
type LogisticsItem = { kind: 'logistics'; id: string; created_at: string; action: string; companyName: string; orderNumber: string | null; memo: string | null };
type HistoryItem = InventoryItem | LogisticsItem;

type TypeFilter = 'all' | 'in' | 'out' | 'pack' | 'ship';

interface Props {
  history: HistoryItem[];
}

export default function HistoryClient({ history }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const filtered = useMemo(() => {
    let result = history;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((item) => {
        if (item.kind === 'inventory') {
          return item.productName.toLowerCase().includes(q) || item.barcode.toLowerCase().includes(q);
        }
        return item.companyName.toLowerCase().includes(q) || (item.orderNumber ?? '').toLowerCase().includes(q);
      });
    }
    if (typeFilter !== 'all') {
      result = result.filter((item) => {
        if (typeFilter === 'in') return item.kind === 'inventory' && item.type === 'in';
        if (typeFilter === 'out') return item.kind === 'inventory' && item.type === 'out';
        if (typeFilter === 'pack') return item.kind === 'logistics' && item.action === '집하완료';
        return item.kind === 'logistics' && item.action === '출하완료';
      });
    }
    return result;
  }, [history, search, typeFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">처리 이력</h1>
      </div>

      {/* 검색 및 필터 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제품명, 바코드, 업체명 검색"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex rounded-md border overflow-hidden shrink-0">
          {([['all', '전체'], ['in', '입고'], ['out', '출고'], ['pack', '집하'], ['ship', '출하']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-l first:border-l-0 ${
                typeFilter === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 이력 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {search || typeFilter !== 'all' ? '조건에 맞는 이력이 없습니다' : '처리 이력이 없습니다'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            if (item.kind === 'inventory') {
              const isIn = item.type === 'in';
              return (
                <div
                  key={item.id}
                  className="rounded-lg border bg-white p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      isIn ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {isIn ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">{item.productName}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          isIn ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {isIn ? '입고' : '출고'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 font-mono">{item.barcode}</p>
                      {item.memo && (
                        <p className="text-xs text-gray-500 mt-0.5">{item.memo}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${isIn ? 'text-blue-600' : 'text-red-600'}`}>
                      {isIn ? '+' : '-'}{item.quantity}
                    </span>
                    <p className="text-xs text-gray-400">{dayjs(item.created_at).format('MM.DD HH:mm')}</p>
                  </div>
                </div>
              );
            }

            const isPack = item.action === '집하완료';
            return (
              <div
                key={item.id}
                className="rounded-lg border bg-white p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isPack ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'
                  }`}>
                    {isPack ? <PackageCheck size={18} /> : <Truck size={18} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">{item.companyName}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        isPack ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {item.action}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono">
                      {item.orderNumber ?? '-'}
                    </p>
                    {item.memo && (
                      <p className="text-xs text-gray-500 mt-0.5">{item.memo}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">{dayjs(item.created_at).format('MM.DD HH:mm')}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
