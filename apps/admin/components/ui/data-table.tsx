'use client';

import {
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface DataTableProps<TData extends { id: string }> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Record<row.id, boolean> 형태의 선택 상태 */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
  /** 글로벌 필터 값 (모든 컬럼 대상 검색) */
  globalFilter?: string;
}

/** 체크박스 선택 컬럼 헬퍼 */
export function selectColumn<TData extends { id: string }>(): ColumnDef<TData, unknown> {
  return {
    id: 'select',
    size: 40,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
      />
    ),
  };
}

export function DataTable<TData extends { id: string }>({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
  emptyMessage = '데이터가 없습니다',
  onRowClick,
  globalFilter,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      rowSelection: rowSelection ?? {},
      globalFilter,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: onRowSelectionChange
      ? (updater) => {
          const next = typeof updater === 'function'
            ? updater(rowSelection ?? {})
            : updater;
          onRowSelectionChange(next);
        }
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: !!onRowSelectionChange,
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="bg-gray-50">
            {hg.headers.map((header) => {
              const sortable = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              return (
                <TableHead
                  key={header.id}
                  className={cn(sortable && 'cursor-pointer select-none')}
                  style={header.getSize() !== 150 ? { width: header.getSize() } : undefined}
                  onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                >
                  {header.isPlaceholder ? null : (
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sortable && (
                        sorted === 'asc' ? <ArrowUp size={14} className="text-gray-600" />
                        : sorted === 'desc' ? <ArrowDown size={14} className="text-gray-600" />
                        : <ArrowUpDown size={14} className="text-gray-300" />
                      )}
                    </div>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-8 text-center text-gray-400 text-sm">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? 'selected' : undefined}
              className={cn(
                row.getIsSelected() && 'bg-blue-50/50',
                onRowClick && 'cursor-pointer',
              )}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
