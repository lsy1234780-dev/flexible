import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';

export interface TableColumn {
  key: string;
  label: string;
  flex?: number;              // flex 비율 (기본값: 1)
  width?: number;             // 고정 너비 (pt) — flex 보다 우선
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: Record<string, unknown>) => string;
}

interface TableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  showIndex?: boolean;
}

const INDEX_WIDTH = 28;

const Table: React.FC<TableProps> = ({ columns, data, showIndex = false }) => (
  <View style={styles.table}>
    {/* 헤더 행 */}
    <View style={styles.headerRow}>
      {showIndex && (
        <View style={[styles.cell, styles.headerCell, { width: INDEX_WIDTH }]}>
          <Text style={[styles.headerText, { textAlign: 'center' }]}>No</Text>
        </View>
      )}
      {columns.map((col) => (
        <View
          key={col.key}
          style={[
            styles.cell,
            styles.headerCell,
            col.width ? { width: col.width } : { flex: col.flex ?? 1 },
          ]}
        >
          <Text style={[styles.headerText, { textAlign: col.align ?? 'center' }]}>
            {col.label}
          </Text>
        </View>
      ))}
    </View>

    {/* 데이터 행 */}
    {data.map((row, rowIndex) => (
      <View
        key={rowIndex}
        style={[styles.dataRow, ...(rowIndex % 2 === 1 ? [styles.altRow] : [])]}
        wrap={false}
      >
        {showIndex && (
          <View style={[styles.cell, { width: INDEX_WIDTH }]}>
            <Text style={[styles.cellText, { textAlign: 'center' }]}>{rowIndex + 1}</Text>
          </View>
        )}
        {columns.map((col) => {
          const rawValue = row[col.key];
          const displayValue = col.render
            ? col.render(rawValue, row)
            : rawValue !== undefined && rawValue !== null
              ? String(rawValue)
              : '-';

          return (
            <View
              key={col.key}
              style={[
                styles.cell,
                col.width ? { width: col.width } : { flex: col.flex ?? 1 },
              ]}
            >
              <Text style={[styles.cellText, { textAlign: col.align ?? 'left' }]}>
                {displayValue}
              </Text>
            </View>
          );
        })}
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#c8d0db',
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#1a3a5c',
  },
  dataRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e6ef',
  },
  altRow: {
    backgroundColor: '#f4f7fb',
  },
  cell: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRightWidth: 1,
    borderRightColor: '#c8d0db',
    justifyContent: 'center',
  },
  headerCell: {
    backgroundColor: 'transparent',
  },
  headerText: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 9,
    color: '#ffffff',
  },
  cellText: {
    fontFamily: 'NotoSansKR',
    fontSize: 9,
    color: '#333333',
  },
});

export default Table;
