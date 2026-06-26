import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { QuotationData, QuotationItem } from '../types';
import { registerFonts } from '../fonts';
import Header from './shared/Header';
import Footer from './shared/Footer';
import Table, { TableColumn } from './shared/Table';

// 렌더링 전 폰트 등록
registerFonts();

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
const formatKRW = (n: number): string => n.toLocaleString('ko-KR') + '원';
const formatNum = (n: number): string => n.toLocaleString('ko-KR');
const formatDate = (d: Date): string => {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────
// 품목 테이블 컬럼 정의
// ─────────────────────────────────────────────
const ITEM_COLUMNS: TableColumn[] = [
  { key: 'productName', label: '품목', flex: 3, align: 'left' },
  { key: 'barcode', label: '품목코드', flex: 2, align: 'center', render: (v) => String(v || '-') },
  { key: 'spec', label: '규격', flex: 1, align: 'center', render: (v) => String(v ?? '-') },
  { key: 'unit', label: '단위', flex: 0.7, align: 'center', render: (v) => String(v ?? '개') },
  {
    key: 'quantity',
    label: '수량',
    flex: 1,
    align: 'right',
    render: (v) => formatNum(Number(v)),
  },
  {
    key: 'unitPrice',
    label: '단가',
    flex: 1.3,
    align: 'right',
    render: (v) => formatNum(Number(v)),
  },
  {
    key: 'totalPrice',
    label: '합계',
    flex: 1.3,
    align: 'right',
    render: (v) => formatNum(Number(v)),
  },
  {
    key: 'taxLabel',
    label: '과세액',
    flex: 1.2,
    align: 'right',
    render: (v) => String(v ?? ''),
  },
];

// ─────────────────────────────────────────────
// 소형 정보 행 컴포넌트
// ─────────────────────────────────────────────
const InfoRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label,
  value,
  highlight = false,
}) => (
  <View style={infoStyles.row}>
    <Text style={infoStyles.label}>{label}</Text>
    <Text style={[infoStyles.value, ...(highlight ? [infoStyles.valueHighlight] : [])]}>{value}</Text>
  </View>
);

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e6ef',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  label: {
    fontFamily: 'NotoSansKR',
    fontSize: 8,
    color: '#888888',
    width: 72,
  },
  value: {
    fontFamily: 'NotoSansKR',
    fontSize: 9,
    color: '#222222',
    flex: 1,
  },
  valueHighlight: {
    color: '#1a3a5c',
    fontWeight: 'bold',
  },
});

// ─────────────────────────────────────────────
// 메인 문서 컴포넌트
// ─────────────────────────────────────────────
interface Props {
  data: QuotationData;
}

const QuotationDocument: React.FC<Props> = ({ data }) => {
  const taxRate = data.taxRate ?? 0.1;
  const supplyAmount = data.items.reduce((sum, item) => sum + item.totalPrice, 0);
  // 과세 대상 항목 합계만으로 부가세 계산
  const taxableAmount = data.items
    .filter((item) => item.isTaxable !== false)
    .reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = taxRate === 0 ? 0 : Math.round(taxableAmount * taxRate);
  const totalAmount = supplyAmount + taxAmount;

  // Table 에 넘길 데이터 형태로 변환 (과세 여부 표시 추가)
  const tableData = data.items.map((item) => ({
    ...item,
    taxLabel: item.isTaxable !== false ? formatNum(Math.round(item.totalPrice * 0.1)) : '비과세',
  } as Record<string, unknown>));

  return (
    <Document
      title={`견적서_${data.quotationNumber}`}
      author={data.issuer.name}
      creator="pdf-lib"
    >
      <Page size="A4" style={styles.page}>
        {/* 발행사 헤더 */}
        <Header issuer={data.issuer} />

        {/* 문서 제목 */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>견 적 서</Text>
        </View>

        {/* 메타 섹션 — 수신 정보 + 문서 정보 */}
        <View style={styles.metaSection}>
          {/* 수신 업체 정보 */}
          <View style={styles.recipientBox}>
            <Text style={styles.recipientHeader}>수 신</Text>
            <Text style={styles.recipientName}>{data.company.name} 귀중</Text>
            {data.company.businessNumber && (
              <Text style={styles.recipientDetail}>
                사업자번호: {data.company.businessNumber}
              </Text>
            )}
            {data.company.address && (
              <Text style={styles.recipientDetail}>{data.company.address}</Text>
            )}
            {data.company.contact && (
              <Text style={styles.recipientDetail}>담당: {data.company.contact}</Text>
            )}
          </View>

          {/* 문서 정보 */}
          <View style={styles.infoBox}>
            <InfoRow label="견적번호" value={data.quotationNumber} highlight />
            <InfoRow label="발행일" value={formatDate(data.issuedAt)} />
            {data.validUntil && (
              <InfoRow label="유효기간" value={formatDate(data.validUntil)} />
            )}
            <InfoRow
              label={`부가세(${taxRate * 100}%)`}
              value={taxRate === 0 ? '면세' : formatKRW(taxAmount)}
            />
          </View>
        </View>

        {/* 합계 금액 배너 */}
        <View style={styles.totalBanner}>
          <Text style={styles.totalLabel}>합 계 금 액</Text>
          <Text style={styles.totalAmount}>{formatKRW(totalAmount)}</Text>
        </View>

        {/* 품목 테이블 */}
        <View style={styles.tableSection}>
          <Table columns={ITEM_COLUMNS} data={tableData} showIndex />
        </View>

        {/* 소계 */}
        <View style={styles.summarySection}>
          <SummaryRow label="공급가액" value={formatKRW(supplyAmount)} />
          <SummaryRow
            label={`부가세 (${taxRate * 100}%)`}
            value={taxRate === 0 ? '면세' : formatKRW(taxAmount)}
          />
          <SummaryRow label="합 계" value={formatKRW(totalAmount)} isBold />
        </View>

        {/* 비고 */}
        {data.note && (
          <View style={styles.noteSection}>
            <Text style={styles.noteLabel}>비고</Text>
            <Text style={styles.noteText}>{data.note}</Text>
          </View>
        )}

        {/* 서명란 */}
        <View style={styles.signatureSection}>
          <Text style={styles.signatureCaption}>위와 같이 견적서를 제출합니다.</Text>
          <View style={styles.signatureBox}>
            <View style={styles.signatureCompanyRow}>
              <Text style={styles.signatureCompanyName}>{data.issuer.name}</Text>
              {data.issuer.ceo && (
                <Text style={styles.signatureCeo}>대표자: {data.issuer.ceo}</Text>
              )}
            </View>
            <View style={styles.stampBox}>
              <Text style={styles.stampText}>직인</Text>
            </View>
          </View>
        </View>

        {/* 페이지 번호 (fixed) */}
        <Footer />
      </Page>
    </Document>
  );
};

// ─────────────────────────────────────────────
// 소계 행 헬퍼
// ─────────────────────────────────────────────
const SummaryRow: React.FC<{ label: string; value: string; isBold?: boolean }> = ({
  label,
  value,
  isBold = false,
}) => (
  <View style={[summaryStyles.row, ...(isBold ? [summaryStyles.boldRow] : [])]}>
    <Text style={[summaryStyles.label, ...(isBold ? [summaryStyles.boldText] : [])]}>{label}</Text>
    <Text style={[summaryStyles.value, ...(isBold ? [summaryStyles.boldText] : [])]}>{value}</Text>
  </View>
);

const summaryStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e6ef',
  },
  boldRow: {
    backgroundColor: '#f4f7fb',
    borderTopWidth: 1.5,
    borderTopColor: '#1a3a5c',
  },
  label: {
    fontFamily: 'NotoSansKR',
    fontSize: 9,
    color: '#666666',
    width: 90,
    textAlign: 'right',
    marginRight: 16,
  },
  value: {
    fontFamily: 'NotoSansKR',
    fontSize: 9,
    color: '#333333',
    width: 80,
    textAlign: 'right',
  },
  boldText: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 10,
    color: '#1a3a5c',
  },
});

// ─────────────────────────────────────────────
// 페이지 스타일
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansKR',
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    backgroundColor: '#ffffff',
  },

  // 제목
  titleSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 22,
    color: '#1a3a5c',
    letterSpacing: 4,
  },

  // 메타 섹션
  metaSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  recipientBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c8d0db',
    borderRadius: 3,
    padding: 10,
  },
  recipientHeader: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 8,
    color: '#888888',
    marginBottom: 4,
    letterSpacing: 2,
  },
  recipientName: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 13,
    color: '#1a3a5c',
    marginBottom: 4,
  },
  recipientDetail: {
    fontFamily: 'NotoSansKR',
    fontSize: 8,
    color: '#666666',
    marginBottom: 2,
  },
  infoBox: {
    width: 200,
    borderWidth: 1,
    borderColor: '#c8d0db',
    borderRadius: 3,
    overflow: 'hidden',
  },

  // 합계 배너
  totalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a3a5c',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 3,
    marginBottom: 10,
  },
  totalLabel: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 11,
    color: '#ffffff',
    letterSpacing: 2,
  },
  totalAmount: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 14,
    color: '#ffd700',
  },

  // 테이블
  tableSection: {
    marginBottom: 6,
  },

  // 소계
  summarySection: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#c8d0db',
    borderRadius: 2,
    overflow: 'hidden',
  },

  // 비고
  noteSection: {
    borderWidth: 1,
    borderColor: '#c8d0db',
    borderRadius: 3,
    padding: 8,
    marginBottom: 12,
  },
  noteLabel: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 8,
    color: '#888888',
    marginBottom: 4,
    letterSpacing: 1,
  },
  noteText: {
    fontFamily: 'NotoSansKR',
    fontSize: 9,
    color: '#444444',
    lineHeight: 1.5,
  },

  // 서명란
  signatureSection: {
    marginTop: 4,
    alignItems: 'flex-end',
  },
  signatureCaption: {
    fontFamily: 'NotoSansKR',
    fontSize: 9,
    color: '#666666',
    marginBottom: 8,
  },
  signatureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#c8d0db',
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  signatureCompanyRow: {
    flexDirection: 'column',
  },
  signatureCompanyName: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 11,
    color: '#1a3a5c',
    marginBottom: 3,
  },
  signatureCeo: {
    fontFamily: 'NotoSansKR',
    fontSize: 9,
    color: '#666666',
  },
  stampBox: {
    width: 56,
    height: 56,
    borderWidth: 1.5,
    borderColor: '#cc0000',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampText: {
    fontFamily: 'NotoSansKR',
    fontSize: 11,
    color: '#cc0000',
  },
});

export default QuotationDocument;
