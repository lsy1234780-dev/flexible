'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import type { Product } from '@/types/database';
import ModalBase from '@/components/ModalBase';

interface Props {
  product: Product;
  onClose: () => void;
}

export default function BarcodeModal({ product, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    import('jsbarcode').then((mod) => {
      if (cancelled || !svgRef.current) return;
      try {
        const JsBarcode = mod.default;
        JsBarcode(svgRef.current, product.barcode, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10,
        });
      } catch (e) {
        setError(`바코드 생성 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
      }
    });

    return () => { cancelled = true; };
  }, [product.barcode]);

  function handleDownload() {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode_${product.barcode}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>${product.name} 바코드</title></head>
      <body style="margin:0;display:flex;flex-direction:column;align-items:center;padding:20px;font-family:sans-serif;">
        <p style="margin-bottom:8px;font-size:14px;color:#333;">${product.name}</p>
        ${svgData}
        <script>window.onload=()=>{window.print();window.close();}<\/script>
      </body></html>
    `);
    printWindow.document.close();
  }

  return (
    <ModalBase
      open
      onClose={onClose}
      title={product.name}
      footer={
        <>
          <Button className="flex-1" variant="outline" size="sm" onClick={handleDownload} disabled={!!error}>
            <Download size={14} />
            SVG 저장
          </Button>
          <Button className="flex-1" size="sm" onClick={handlePrint} disabled={!!error}>
            <Printer size={14} />
            프린트
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          <svg ref={svgRef} />
        )}
        <p className="text-sm text-muted-foreground">바코드: {product.barcode}</p>
      </div>
    </ModalBase>
  );
}
