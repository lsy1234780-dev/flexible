import { getLogisticsHistory } from '@/actions/orders';
import { PackageCheck, Truck, ArrowDownToLine, ArrowUpFromLine, PackageOpen } from 'lucide-react';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const history = await getLogisticsHistory(50);

  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-gray-500 uppercase tracking-widest mb-4">
        처리 이력 (최근 50건)
      </p>

      {history.length === 0 ? (
        <div className="text-center py-16 text-gray-600">처리 이력이 없습니다</div>
      ) : (
        history.map((item) => {
          if (item.kind === 'inventory') {
            const isIn = item.type === 'in';
            return (
              <div key={item.id} className="bg-gray-900 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isIn ? 'bg-blue-900/50 text-blue-400' : 'bg-red-900/50 text-red-400'
                  }`}>
                    {isIn ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white text-sm">{item.productName}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        isIn ? 'bg-blue-900/40 text-blue-300' : 'bg-red-900/40 text-red-300'
                      }`}>
                        {isIn ? '입고' : '출고'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono">{item.barcode}</p>
                    {item.memo && <p className="text-xs text-gray-600 mt-0.5">{item.memo}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-bold ${isIn ? 'text-blue-400' : 'text-red-400'}`}>
                    {isIn ? '+' : '-'}{item.quantity}
                  </span>
                  <p className="text-xs text-gray-600">{dayjs(item.created_at).format('MM.DD HH:mm')}</p>
                </div>
              </div>
            );
          }

          if (item.kind === 'receiving') {
            return (
              <div key={item.id} className="bg-gray-900 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-900/50 text-emerald-400">
                    <PackageOpen size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white text-sm">
                        {item.title ?? item.productNames.join(', ')}{!item.title && item.productCount > 3 ? ` 외 ${item.productCount - 3}종` : ''}
                      </p>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300">입고완료</span>
                    </div>
                    <p className="text-xs text-gray-500">{item.productCount}종 / {item.totalQty}개</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-emerald-400">+{item.totalQty}</span>
                  <p className="text-xs text-gray-600">{dayjs(item.created_at).format('MM.DD HH:mm')}</p>
                </div>
              </div>
            );
          }

          const isPack = item.action === '집하완료';
          return (
            <div key={item.id} className="bg-gray-900 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  isPack ? 'bg-yellow-900/50 text-yellow-400' : 'bg-green-900/50 text-green-400'
                }`}>
                  {isPack ? <PackageCheck size={18} /> : <Truck size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white text-sm">{item.companyName}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      isPack ? 'bg-yellow-900/40 text-yellow-300' : 'bg-green-900/40 text-green-300'
                    }`}>
                      {item.action}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono">{item.orderNumber ?? '-'}</p>
                  {item.memo && <p className="text-xs text-gray-600 mt-0.5">{item.memo}</p>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-600">{dayjs(item.created_at).format('MM.DD HH:mm')}</p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
