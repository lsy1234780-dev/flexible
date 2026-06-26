import React from 'react';
import { DocumentProps, renderToBuffer, pdf } from '@react-pdf/renderer';
import { QuotationData } from '../types';
import QuotationDocument from '../templates/QuotationDocument';

/**
 * 견적서 PDF를 생성하여 Buffer 로 반환합니다. (서버사이드 전용)
 *
 * @example
 * // Next.js API Route
 * const buffer = await generateQuotationBuffer(data);
 * return new Response(buffer, { headers: { 'Content-Type': 'application/pdf' } });
 */
export async function generateQuotationBuffer(data: QuotationData): Promise<Buffer> {
  const element = React.createElement(QuotationDocument, { data }) as React.ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

/**
 * 견적서 PDF를 생성하여 Blob 으로 반환합니다. (브라우저 다운로드 or 서버 Blob 처리)
 */
export async function generateQuotation(data: QuotationData): Promise<Blob> {
  const element = React.createElement(QuotationDocument, { data }) as React.ReactElement<DocumentProps>;
  return pdf(element).toBlob();
}
