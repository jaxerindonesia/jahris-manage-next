"use client";

import { Download, Edit, Filter, Info, Plus, Receipt, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DefaultColumnFormat } from "@/components/dynamic-page";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PettyCashDto } from "@/lib/dto/petty-cash";

export const itemsPerPageOptions = [5, 10, 25, 50, 100];
export const ITEMS_PER_PAGE = 10;

interface HeaderToolbarProps {
  actions: {
    onAdd: () => void;
    onExport?: () => void;
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
    category: string;
    setCategory: React.Dispatch<React.SetStateAction<string>>;
    status: string;
    setStatus: React.Dispatch<React.SetStateAction<string>>;
  };
}

interface RenderActionsProps {
  row: PettyCashDto;
  checkRole: (module: string, action: string) => boolean;
  onViewDetail?: (id: string) => void;
  onViewUsage?: (id: string) => void;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  deleteId?: string | null;
  setDeleteId?: React.Dispatch<React.SetStateAction<string | null>>;
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  TRANSFER: "Ditransfer",
  SETTLE: "Settle (Done)",
};

export const STATUS_COLOR: Record<string, string> = {
  PENDING:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  TRANSFER:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  SETTLE:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const modelName = "pettycash";

const CATEGORIES = [
  "Operasional",
  "Transportasi",
  "Konsumsi",
  "Kesehatan",
  "Lainnya",
];

export const columnFormats: DefaultColumnFormat<PettyCashDto>[] = [
  {
    key: "user",
    title: "Karyawan",
    textClassName: "font-semibold text-slate-900 dark:text-slate-100",
    formatter: (_value, row) => row.user?.name || "-",
  },
  {
    key: "purpose",
    title: "Tujuan & Kategori",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => (
      <div className="flex flex-col gap-1">
        <span className="font-semibold">{row.purpose || "-"}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{row.category || "-"}</span>
      </div>
    ),
  },
  {
    key: "amount",
    title: "Nominal Dana",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (value) => value ? `Rp ${value.toLocaleString("id-ID")}` : "-",
  },
  {
    key: "usages",
    title: "Total Digunakan",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => {
      const totalUsed = (row.usages ?? []).filter((usage) => usage.transactionType !== "TOP_UP" && usage.transactionType !== "RETURN").reduce((sum, usage) => sum + (usage.amount || 0), 0);
      return `Rp ${totalUsed.toLocaleString("id-ID")}`;
    },
  },
  {
    key: "Sisa Saldo",
    title: "Sisa Saldo",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => {
      const remaining = (row.amount ?? 0) + (row.usages ?? []).reduce((sum, usage) => sum + (usage.transactionType === "TOP_UP" ? usage.amount : -usage.amount), 0);
      return <span className={remaining < 0 ? "font-semibold text-red-600" : ""}>Rp {remaining.toLocaleString("id-ID")}</span>;
    },
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
      {actions.checkRole(modelName, "create") && (
        <Button
          onClick={actions.onAdd}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 sm:w-auto"
        >
          <Plus className="w-4 h-4" /> Tambah
        </Button>
      )}

      <div className="flex-1" />

      <Button
        variant="outline"
        onClick={() => filters.setShow(!filters.show)}
        className={`relative flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 transition-colors sm:w-auto ${filters.show
          ? "border-blue-500 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
          : "border-gray-300 text-slate-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
      >
        <Filter className="w-4 h-4" />
        Filter
        {filters.activeCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {filters.activeCount}
          </span>
        )}
      </Button>

      {actions.checkRole(modelName, "export") && (
        <Button
          onClick={actions.onExport}
          disabled={actions.isExporting}
          variant="outline"
          className="flex w-full items-center justify-center gap-2 border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20 sm:w-auto"
        >
          <Download className="w-4 h-4" />
          {actions.isExporting ? "Mengexport..." : "Export Excel"}
        </Button>
      )}
    </div>

    {filters.show && (
      <div className="mb-6 rounded-lg border bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Filter Data Petty Cash
          </h3>
          {filters.activeCount > 0 && (
            <button
              onClick={filters.clear}
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              <X className="w-4 h-4" /> Hapus Semua Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Cari
            </Label>
            <Input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => filters.setSearchTerm(e.target.value)}
              placeholder="Karyawan atau tujuan..."
              className="w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <Label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Kategori
            </Label>
            <Select
              value={filters.category}
              onValueChange={filters.setCategory}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Semua Kategori" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>

                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Status
            </Label>
            <Select
              value={filters.status}
              onValueChange={filters.setStatus}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="TRANSFER">Ditransfer</SelectItem>
                <SelectItem value="SETTLE">Settle (Done)</SelectItem>
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
  onViewUsage,
  onDelete,
  deleteId,
  setDeleteId,
}: RenderActionsProps) => (
  <div className="flex justify-end gap-1">
    {checkRole(modelName, "get-by-id") && (
      <Button
        variant="ghost"
        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        onClick={() => row.id && onViewDetail && onViewDetail(row.id)}
      >
        <Info className="w-4 h-4" />
      </Button>
    )}
    {row.status === "TRANSFER" && checkRole(modelName, "update-report") && (
      <Button
        variant="ghost"
        className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        onClick={() => row.id && onViewUsage && onViewUsage(row.id)}
      >
        <Receipt className="w-4 h-4" />
      </Button>
    )}
    {checkRole(modelName, "update") && (
      <Button
        variant="ghost"
        className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        onClick={() => row.id && onView && onView(row.id)}
      >
        <Edit className="w-4 h-4" />
      </Button>
    )}
    {checkRole(modelName, "delete") && (
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
                    onDelete?.(row.id);
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
  </div>
);
