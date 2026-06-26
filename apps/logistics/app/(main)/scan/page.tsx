'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, ScanBarcode } from 'lucide-react';
import { toast } from 'sonner';
import { processBarcodeScan } from '@/actions/inventory';
import { useRouter } from 'next/navigation';

type ResultStatus = 'idle' | 'success' | 'error';

export default function ScanPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<'in' | 'out'>('in');
  const [status, setStatus] = useState<ResultStatus>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // BT 스캐너 Enter 감지 — 바코드만 채우고, 처리는 버튼으로
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
    };
    input.addEventListener('keydown', onKey);
    return () => input.removeEventListener('keydown', onKey);
  }, []);

  async function submit(barcode: string) {
    if (loading) return;
    const qty = parseInt(qtyRef.current?.value ?? '1', 10) || 1;
    const memo = memoRef.current?.value.trim() ?? '';
    const fd = new FormData();
    fd.set('barcode', barcode);
    fd.set('quantity', String(qty));
    fd.set('type', type);
    fd.set('memo', memo);

    setLoading(true);
    setStatus('idle');

    const result = await processBarcodeScan(fd);
    setLoading(false);

    if (result.error) {
      setStatus('error');
      setMessage(result.error);
      if (result.error.includes('제품을 찾을 수 없습니다')) {
        toast.error('등록되지 않은 바코드입니다');
      }
    } else {
      setStatus('success');
      setMessage(result.message!);
      router.refresh();
    }

    if (memoRef.current) memoRef.current.value = '';
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }

    setTimeout(() => setStatus('idle'), 3000);
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* 입고/출고 토글 */}
      <div className="grid grid-cols-2 gap-2 h-16">
        <button
          type="button"
          onClick={() => setType('in')}
          className={`rounded-xl text-lg font-bold transition-colors ${
            type === 'in' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
          }`}
        >
          입고
        </button>
        <button
          type="button"
          onClick={() => setType('out')}
          className={`rounded-xl text-lg font-bold transition-colors ${
            type === 'out' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'
          }`}
        >
          출고
        </button>
      </div>

      {/* 결과 표시 */}
      <div className={`rounded-xl p-5 flex items-center gap-3 transition-all ${
        status === 'success' ? 'bg-green-900/60 text-green-300' :
        status === 'error' ? 'bg-red-900/60 text-red-300' :
        'bg-gray-800/50 text-gray-500'
      }`}>
        {status === 'success' && <CheckCircle2 size={28} className="shrink-0" />}
        {status === 'error' && <XCircle size={28} className="shrink-0" />}
        {status === 'idle' && <ScanBarcode size={28} className="shrink-0" />}
        <p className="text-base font-medium leading-snug">
          {status === 'idle' ? '바코드를 스캔하세요' : message}
        </p>
      </div>

      {/* 바코드 입력 */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400 uppercase tracking-widest">바코드</label>
        <input
          ref={inputRef}
          type="text"
          placeholder="스캐너 또는 직접 입력"
          autoComplete="off"
          disabled={loading}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 수량 */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400 uppercase tracking-widest">수량</label>
        <input
          ref={qtyRef}
          type="number"
          min={1}
          defaultValue={1}
          disabled={loading}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-2xl text-white text-right focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 비고 */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400 uppercase tracking-widest">비고</label>
        <input
          ref={memoRef}
          type="text"
          placeholder="비고 (선택사항)"
          disabled={loading}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 처리 버튼 */}
      <button
        type="button"
        onClick={() => {
          const barcode = inputRef.current?.value.trim();
          if (barcode) submit(barcode);
        }}
        disabled={loading}
        className={`mt-auto h-16 rounded-xl text-xl font-bold transition-colors disabled:opacity-50 ${
          type === 'out' ? 'bg-red-600 hover:bg-red-700 active:bg-red-800' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
        }`}
      >
        {loading ? '처리 중...' : `${type === 'in' ? '입고' : '출고'} 처리`}
      </button>
    </div>
  );
}
