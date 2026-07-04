import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { registerFonts } from '../fonts';
import Table, { TableColumn } from './shared/Table';

// 경비 지급 내역서 — 우리 경계 안의 문서 (docs/architecture/HR.md §6):
// expense_claim 데이터를 "포맷"만 한다. 급여명세서/국세청 지급명세서 아님 — 계산·세무 없음.

registerFonts();

const formatKRW = (n: number): string => Number(n).toLocaleString('ko-KR') + '원';
const formatDate = (d: string | Date | null): string => {
  if (!d) return '-';
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};

export interface ExpenseStatementItem {
  spentAt: string;
  category: string;
  merchant: string;
  amount: number;
  vatAmount: number | null;
  paymentMethod: string;
  memo: string;
}

export interface ExpenseStatementData {
  title: string;
  claimantName: string;
  claimKind: string;          // '개인 경비 환급' | '법인카드'
  status: string;             // 결재 상태 라벨
  createdAt: string;
  approvedNote?: string | null;
  totalAmount: number;
  paidAt: string | null;      // 지급일 (환급 건)
  settleLabel: string;        // 지급 상태 라벨
  confirmLabel: string;       // 수령확인 라벨 ("본인 확인" / "미이의 마감" 구분 명시)
  workspaceName: string;
  items: ExpenseStatementItem[];
}

const ITEM_COLUMNS: TableColumn[] = [
  { key: 'spentAt', label: '사용일', flex: 1.1, align: 'center' },
  { key: 'category', label: '항목', flex: 1, align: 'center' },
  { key: 'merchant', label: '사용처', flex: 2, align: 'left', render: (v) => String(v || '-') },
  { key: 'paymentMethod', label: '결제수단', flex: 1, align: 'center' },
  { key: 'amount', label: '금액', flex: 1.3, align: 'right', render: (v) => Number(v).toLocaleString('ko-KR') },
  { key: 'vatAmount', label: '부가세', flex: 1, align: 'right', render: (v) => (v == null ? '-' : Number(v).toLocaleString('ko-KR')) },
  { key: 'memo', label: '비고', flex: 1.5, align: 'left', render: (v) => String(v || '') },
];

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const ExpenseStatementDocument: React.FC<{ data: ExpenseStatementData }> = ({ data }) => (
  <Document title={`경비지급내역서_${data.title}`}>
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>경비 지급 내역서</Text>

      <View style={styles.infoBox}>
        <InfoRow label="건명" value={data.title} />
        <InfoRow label="신청자" value={data.claimantName} />
        <InfoRow label="구분" value={data.claimKind} />
        <InfoRow label="신청일" value={formatDate(data.createdAt)} />
        <InfoRow label="결재 상태" value={data.status} />
        <InfoRow label="지급 상태" value={data.settleLabel} />
        {data.paidAt && <InfoRow label="지급일" value={formatDate(data.paidAt)} />}
        <InfoRow label="수령 확인" value={data.confirmLabel} />
      </View>

      <Table columns={ITEM_COLUMNS} data={data.items as unknown as Record<string, unknown>[]} showIndex />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>합계</Text>
        <Text style={styles.totalValue}>{formatKRW(data.totalAmount)}</Text>
      </View>

      <Text style={styles.disclaimer}>
        본 내역서는 {data.workspaceName}의 경비 청구 기록을 그대로 정리한 문서입니다.
        급여·세무 계산이 포함되어 있지 않으며, 임금명세서 또는 세무 신고용 지급명세서를 대체하지 않습니다.
      </Text>
    </Page>
  </Document>
);

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 42,
    fontFamily: 'NotoSansKR',
    fontSize: 9,
    color: '#222222',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 18,
    letterSpacing: 6,
  },
  infoBox: {
    borderWidth: 1,
    borderColor: '#e0e6ef',
    borderRadius: 3,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f6',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  infoLabel: { width: 72, fontSize: 8, color: '#888888' },
  infoValue: { flex: 1, fontSize: 9 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f4f6fa',
    borderRadius: 3,
  },
  totalLabel: { fontSize: 10, color: '#555555', marginRight: 12 },
  totalValue: { fontSize: 12, fontWeight: 'bold', color: '#1a3a5c' },
  disclaimer: {
    marginTop: 24,
    fontSize: 7,
    color: '#999999',
    lineHeight: 1.5,
  },
});

export default ExpenseStatementDocument;
