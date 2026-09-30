"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, DARK_GLASS_PANEL_CLASS } from "@/lib/utils";
import { Button } from "./ui/button";

export type DefaultColumnFormat<T = object> = {
  key: string;
  title: string;
  type?: "text" | "number" | "date" | "html";
  sortable?: boolean;
  textClassName?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatter?: (value: any, row: T) => ReactNode;
};

export type DynamicPageProps<T = object> = {
  toolbar?: ReactNode;
  filterPanel?: ReactNode;
  columns: DefaultColumnFormat<T>[];
  items: T[];
  total?: number;
  currentPage?: number;
  totalPages?: number;
  loading?: boolean;
  emptyMessage?: string;
  tableClassName?: string;
  bodyRowClassName?: string;
  onPageChange?: (page: number) => void;
  renderActions?: (row: T) => ReactNode;
  getRowId?: (row: T, index: number) => string;
  selectedRowIds?: Set<string>;
  onRowSelectionChange?: (rowId: string, selected: boolean) => void;
  onSelectAllChange?: (selected: boolean) => void;
};

export default function DynamicPage<T extends object>({
  toolbar,
  filterPanel,
  columns,
  items,
  total = 0,
  currentPage = 1,
  totalPages = 1,
  loading = false,
  emptyMessage = "Belum ada data",
  tableClassName,
  bodyRowClassName,
  onPageChange,
  renderActions,
  getRowId,
  selectedRowIds,
  onRowSelectionChange,
  onSelectAllChange,
}: DynamicPageProps<T>) {
  const hasPagination = totalPages > 1 && Boolean(onPageChange);
  const hasActions = Boolean(renderActions);
  const hasSelection = Boolean(selectedRowIds && onRowSelectionChange);
  const pageRowIds = items.map((row, index) => getRowId?.(row, index) ?? getFallbackRowId(row, index));
  const allPageRowsSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selectedRowIds?.has(id));

  return (
    <div className={cn("rounded-[16px] border border-slate-200 bg-white p-6 text-slate-900 shadow-sm dark:text-slate-100", DARK_GLASS_PANEL_CLASS)}>
      {toolbar ? <div className="mb-6">{toolbar}</div> : null}
      {filterPanel ? <div className="mb-6">{filterPanel}</div> : null}

      <div className={cn("overflow-x-auto transition-opacity duration-200", loading && "opacity-60")}>
        <Table className={cn("min-w-full text-slate-900 dark:text-slate-200", tableClassName)}>
          <TableHeader>
            <TableRow className="border-slate-200 hover:bg-transparent dark:border-white/10">
              {hasSelection ? (
                <TableHead className="w-12 border-b border-slate-200 px-4 py-5 dark:border-white/10">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua payroll di halaman ini"
                    checked={allPageRowsSelected}
                    onChange={(event) => onSelectAllChange?.(event.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-blue-600"
                  />
                </TableHead>
              ) : null}
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    "h-auto border-b border-slate-200 px-4 py-5 text-[14px] font-semibold text-slate-700 whitespace-nowrap dark:border-white/10 dark:text-slate-200",
                    column.textClassName,
                  )}
                >
                  {column.title}
                </TableHead>
              ))}
              {hasActions ? (
                <TableHead className="h-auto border-b border-slate-200 px-4 py-5 text-[14px] font-semibold text-slate-700 whitespace-nowrap text-right dark:border-white/10 dark:text-slate-200">
                  Aksi
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.length > 0 ? (
              items.map((row, index) => {
                const rowId = pageRowIds[index];
                return (
                  <TableRow
                    key={rowId}
                    className={cn(
                      "border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.06]",
                      bodyRowClassName,
                    )}
                  >
                    {hasSelection ? (
                      <TableCell className="w-12 border-b border-slate-200 px-4 py-5 dark:border-white/10">
                        <input
                          type="checkbox"
                          aria-label={`Pilih baris ${index + 1}`}
                          checked={selectedRowIds?.has(rowId) ?? false}
                          onChange={(event) => onRowSelectionChange?.(rowId, event.target.checked)}
                          className="h-4 w-4 cursor-pointer accent-blue-600"
                        />
                      </TableCell>
                    ) : null}
                    {columns.map((column) => {
                      const value = row[column.key as keyof T];
                      return (
                        <TableCell
                          key={`${rowId}-${column.key}`}
                          className={cn(
                            "border-b border-slate-200 px-4 py-5 text-[15px] leading-6 text-slate-700 whitespace-nowrap dark:border-white/10 dark:text-slate-200/95",
                            column.textClassName,
                          )}
                        >
                          {column.formatter ? column.formatter(value, row) : renderDefaultCell(value, column.type)}
                        </TableCell>
                      );
                    })}
                    {hasActions ? (
                      <TableCell className="border-b border-slate-200 px-4 py-5 text-right dark:border-white/10">
                        {renderActions?.(row)}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            ) : (
              <TableRow className="border-slate-200 hover:bg-transparent dark:border-white/10">
                <TableCell
                  colSpan={columns.length + (hasActions ? 1 : 0) + (hasSelection ? 1 : 0)}
                  className="border-b border-slate-200 py-10 text-center text-slate-400 dark:border-white/10 dark:text-slate-400"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-6 flex flex-col gap-3 pt-5 text-slate-600 dark:border-white/10 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px]">
          Menampilkan <span className="font-semibold text-slate-900 dark:text-slate-100">{items.length}</span> dari{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{total}</span> data — Halaman{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{currentPage}</span> dari{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{totalPages}</span>
        </p>

        {hasPagination ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => onPageChange?.(Math.max(currentPage - 1, 1))}
              disabled={currentPage === 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.12]"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              onClick={() => onPageChange?.(Math.min(currentPage + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.12]"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function renderDefaultCell(value: unknown, type: DefaultColumnFormat["type"]) {
  if (value === null || value === undefined || value === "") return "-";
  if (type === "date") return new Date(String(value)).toLocaleString("id-ID");
  return String(value);
}

function getFallbackRowId<T extends object>(row: T, index: number) {
  const rawId = "id" in row ? row.id : undefined;
  if (typeof rawId === "string" || typeof rawId === "number") {
    return String(rawId);
  }

  return String(index);
}
