"use client";

import { Download, Edit, FileText, Filter, Plus, Printer, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DefaultColumnFormat } from "@/components/dynamic-page";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { months } from "@/lib/helper/date";
import { formatCurrency } from "@/lib/helper/format-currency";
import type { PayrollDto } from "@/lib/dto/payroll";
import type React from "react";

export const itemsPerPageOptions = [5, 10, 25, 50, 100];
export const ITEMS_PER_PAGE = 10;

interface HeaderToolbarProps {
  actions: {
    onAdd: () => void;
    onExport?: () => void;
    onPrintAll?: () => void;
    onOpenConfig?: () => void;
    checkRole: (module: string, action: string) => boolean;
    isExporting: boolean;
  };
  filters: {
    show: boolean;
    setShow: React.Dispatch<React.SetStateAction<boolean>>;
    activeCount: number;
    clear: () => void;
    searchTerm: string;
    setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
    periodMode: "month" | "range";
    setPeriodMode: React.Dispatch<React.SetStateAction<"month" | "range">>;
    month: string;
    setMonth: React.Dispatch<React.SetStateAction<string>>;
    year: string;
    setYear: React.Dispatch<React.SetStateAction<string>>;
    startDate: string;
    setStartDate: React.Dispatch<React.SetStateAction<string>>;
    endDate: string;
    setEndDate: React.Dispatch<React.SetStateAction<string>>;
    status: string;
    setStatus: React.Dispatch<React.SetStateAction<string>>;
  };
}

interface RenderActionsProps {
  row: PayrollDto;
  checkRole: (module: string, action: string) => boolean;
  onView?: (id: string) => void;
  onViewDetail?: (id: string) => void;
  onDelete?: (id: string) => void;
  deleteId?: string | null;
  setDeleteId?: React.Dispatch<React.SetStateAction<string | null>>;
}

export const STATUS_LABEL: Record<string, string> = {
  PAID: "Dibayar",
  PENDING: "Pending",
};

export const STATUS_COLOR: Record<string, string> = {
  PAID: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

const modelName = "payrolls";

export const columnFormats: DefaultColumnFormat<PayrollDto>[] = [
  {
    key: "user",
    title: "Karyawan",
    textClassName: "font-semibold text-slate-900 dark:text-slate-100",
    formatter: (_value, row) => row.user?.name ?? "-",
  },
  {
    key: "period",
    title: "Periode",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => `${months.find((m) => m.value === row.month)?.label ?? row.month} ${row.year}`,
  },
  {
    key: "referenceNumber",
    title: "Nomor Referensi",
    textClassName: "font-medium text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => row.referenceNumber || "-",
  },
  {
    key: "basicSalary",
    title: "Gaji Pokok",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (value) => formatCurrency(Number(value || 0)),
  },
  {
    key: "allowances",
    title: "Tunjangan",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (value) => `+ ${formatCurrency(Number(value || 0))}`,
  },
  {
    key: "deductions",
    title: "Potongan",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (value) => `- ${formatCurrency(Number(value || 0))}`,
  },
  {
    key: "totalSalary",
    title: "Total Gaji",
    textClassName: "text-slate-700 dark:text-slate-200 font-semibold",
    formatter: (value) => formatCurrency(Number(value || 0)),
  },
  {
    key: "status",
    title: "Status",
    formatter: (_value, row) => (
      <span
        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLOR[row.status] ?? ""
          }`}
      >
        {STATUS_LABEL[row.status] ?? row.status}
      </span>
    ),
  },
];

export const headerToolbar = ({ actions, filters }: HeaderToolbarProps) => (
  <div>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
      {actions.checkRole(modelName, "set-config") && (
        <Button
          onClick={actions.onOpenConfig}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Settings className="h-4 w-4" />
          Kelola Komponen Payroll
        </Button>
      )}

      {actions.checkRole(modelName, "create") && (
        <Button
          onClick={actions.onAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Proses Gaji
        </Button>
      )}

      <div className="flex-1" />

      <Button
        variant="outline"
        onClick={() => filters.setShow(!filters.show)}
        className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 transition-colors ${filters.show || filters.activeCount > 0
          ? "border-blue-500 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
          : "border-gray-300 text-slate-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
      >
        <Filter className="h-4 w-4" />
        Filter
        {filters.activeCount > 0 && (
          <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
            {filters.activeCount}
          </span>
        )}
      </Button>

      {actions.checkRole(modelName, "export") && (
        <Button
          onClick={actions.onPrintAll}
          disabled={actions.isExporting}
          variant="outline"
          className="flex items-center gap-2 border-blue-600 text-blue-700 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400"
        >
          <FileText className="h-4 w-4" />
          Export PDF
        </Button>
      )}

      {actions.checkRole(modelName, "export") && (
        <Button
          onClick={actions.onExport}
          disabled={actions.isExporting}
          variant="outline"
          className="flex items-center gap-2 border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20"
        >
          <Download className="h-4 w-4" />
          {actions.isExporting ? "Mengexport..." : "Export Excel"}
        </Button>
      )}
    </div>

    {filters.show && (
      <div className="mb-6 rounded-lg border bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/50">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">Filter Data Payroll</h3>
            <div className="inline-flex rounded-lg bg-gray-200/80 p-0.5 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => filters.setPeriodMode("month")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  filters.periodMode === "month"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                By Bulan
              </button>
              <button
                type="button"
                onClick={() => filters.setPeriodMode("range")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  filters.periodMode === "range"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                By Range Tanggal
              </button>
            </div>
          </div>
          {filters.activeCount > 0 && (
            <button onClick={filters.clear} className="flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
              <X className="h-4 w-4" />
              Hapus Semua Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Cari</Label>
            <Input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => filters.setSearchTerm(e.target.value)}
              placeholder="Nama karyawan atau nomor referensi..."
              className="w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {filters.periodMode === "month" ? (
            <>
              <div>
                <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Bulan</Label>
                <Select value={filters.month} onValueChange={filters.setMonth}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Semua Bulan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Bulan</SelectItem>
                    {months.map((month) => (
                      <SelectItem key={month.value} value={String(month.value)}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tahun</Label>
                <Input
                  type="number"
                  value={filters.year === "all" ? "" : filters.year}
                  onChange={(e) => filters.setYear(e.target.value || "all")}
                  placeholder="Contoh: 2024"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tanggal Mulai</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => filters.setStartDate(e.target.value)}
                  className="w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tanggal Selesai</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  min={filters.startDate || undefined}
                  onChange={(e) => filters.setEndDate(e.target.value)}
                  className="w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </>
          )}

          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</Label>
            <Select value={filters.status} onValueChange={filters.setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="PAID">Dibayar (Paid)</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    )}
  </div>
);

export const renderActions = ({
  row,
  checkRole,
  onView,
  onViewDetail,
  onDelete,
  deleteId,
  setDeleteId,
}: RenderActionsProps) => (
  <div className="flex justify-end gap-1">
    <Button
      variant="ghost"
      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
      onClick={() => row.id && onViewDetail && onViewDetail(row.id)}
    >
      <Printer className="h-4 w-4" />
    </Button>

    {checkRole(modelName, "update") && row.status === "PENDING" && (
      <Button
        variant="ghost"
        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        onClick={() => row.id && onView && onView(row.id!)}
      >
        <Edit className="h-4 w-4" />
      </Button>
    )}

    {checkRole(modelName, "delete") && onDelete && (
      <Popover
        open={deleteId === row.id}
        onOpenChange={(open) => setDeleteId?.(open ? row.id! : null)}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 rounded-xl border bg-white text-slate-900 shadow-lg dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 mr-4">
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Apakah Anda yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => setDeleteId?.(null)}
              >
                Batal
              </Button>
              <Button
                variant="destructive" size="sm"
                onClick={() => {
                  if (row.id) {
                    onDelete(row.id);
                    setDeleteId?.(null);
                  }
                }}
              >
                Hapus
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )}
  </div >
);
