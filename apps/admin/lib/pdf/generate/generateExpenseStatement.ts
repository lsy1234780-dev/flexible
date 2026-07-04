import React from 'react';
import { DocumentProps, renderToBuffer } from '@react-pdf/renderer';
import ExpenseStatementDocument, { ExpenseStatementData } from '../templates/ExpenseStatementDocument';

// 경비 지급 내역서 PDF → Buffer (서버사이드 전용, 견적서와 동일 패턴)
export async function generateExpenseStatementBuffer(data: ExpenseStatementData): Promise<Buffer> {
  const element = React.createElement(ExpenseStatementDocument, { data }) as React.ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

export type { ExpenseStatementData };
