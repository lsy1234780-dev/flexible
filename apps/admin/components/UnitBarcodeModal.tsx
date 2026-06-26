'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { toast } from 'sonner';
import { Download, Printer, Pencil, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateUnitBarcode } from '@/actions/products';
import ModalBase from './ModalBase';

interface Props {
  open: boolean;
  onClose: () => void;
  serialId: string;
  currentBarcode: string | null;
  productName: string;
  onSaved: () => void;
  /** 모달 제목 (기본: "바코드 정보") */
  title?: string;
  /** 필드 라벨 (기본: "바코드") */
  label?: string;
  /** 입력 placeholder (기본: "비워두면 바코드 제거") */
  placeholder?: string;
  /** 커스텀 저장 함수 — 미지정 시 updateUnitBarcode 사용 */
  onSave?: (serialId: string, value: string) => Promise<{ error?: string; success?: boolean }>;
}

export default function UnitBarcodeModal({
  open,
  onClose,
  serialId,
  currentBarcode,
  productName,
  onSaved,
  title: modalTitle = '바코드 정보',
  label = '바코드',
  placeholder = '비워두면 바코드 제거',
  onSave,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentBarcode ?? '');
  const [displayBarcode, setDisplayBarcode] = useState(currentBarcode ?? '');
  const svgRef = useRef<SVGSVGElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 다이얼로그 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setDisplayBarcode(currentBarcode ?? '');
      setInputValue(currentBarcode ?? '');
      setEditing(false);
    }
  }, [open, currentBarcode]);

  // 바코드 SVG 렌더링 (debounce)
  const barcodeValue = editing ? inputValue : displayBarcode;
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const value = barcodeValue.trim();
      if (!value || !svgRef.current) {
        if (svgRef.current) svgRef.current.innerHTML = '';
        return;
      }
      import('jsbarcode').then((mod) => {
        if (svgRef.current) {
          try {
            mod.default(svgRef.current, value, {
              format: 'CODE128',
              width: 2,
              height: 80,
              displayValue: true,
              fontSize: 14,
              margin: 10,
            });
          } catch {
            svgRef.current.innerHTML = '';
          }
        }
      });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [barcodeValue, open]);

  function startEditing() {
    setInputValue(displayBarcode);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleConfirmEdit() {
    const newValue = inputValue.trim();
    const saveFn = onSave ?? updateUnitBarcode;
    startTransition(async () => {
      const result = await saveFn(serialId, newValue);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${label} 저장 완료`);
        setDisplayBarcode(newValue || '');
        setEditing(false);
        onSaved();
      }
    });
  }

  function handleDownload() {
    if (!svgRef.current || !barcodeValue.trim()) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode_${barcodeValue.trim()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    if (!svgRef.current || !barcodeValue.trim()) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>${productName} 바코드</title></head>
      <body style="margin:0;display:flex;flex-direction:column;align-items:center;padding:20px;font-family:sans-serif;">
        <p style="margin-bottom:8px;font-size:14px;color:#333;">${productName}</p>
        ${svgData}
        <script>window.onload=()=>{window.print();window.close();}<\/script>
      </body></html>
    `);
    printWindow.document.close();
  }

  const hasBarcode = barcodeValue.trim().length > 0;

  return (
    <ModalBase
      open={open}
      onClose={onClose}
      title={modalTitle}
      footer={
        <>
          <Button className="flex-1" variant="outline" size="sm" onClick={handleDownload} disabled={!hasBarcode}>
            <Download size={14} />
            SVG 저장
          </Button>
          <Button className="flex-1" size="sm" onClick={handlePrint} disabled={!hasBarcode}>
            <Printer size={14} />
            프린트
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {hasBarcode ? (
          <svg ref={svgRef} />
        ) : (
          <div className="flex justify-center items-center min-h-[100px]">
            <span className="text-sm text-gray-300">{label} 없음</span>
          </div>
        )}

        {editing ? (
          <div className="flex items-center gap-2 w-full">
            <span className="text-sm text-muted-foreground shrink-0">{label}:</span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmEdit(); }}
              placeholder={placeholder}
              className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="button"
              onClick={handleConfirmEdit}
              disabled={isPending}
              className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-green-600 disabled:opacity-50"
            >
              <Check size={16} />
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            {label}: {displayBarcode || <span className="text-gray-300 italic">미입력</span>}
            <button
              type="button"
              onClick={startEditing}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <Pencil size={12} />
            </button>
          </p>
        )}
      </div>
    </ModalBase>
  );
}
