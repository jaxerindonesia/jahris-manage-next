"use client";

import { CheckCircle, Download, Edit, Filter, Plus, Printer, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DefaultColumnFormat } from "@/components/dynamic-page";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReimbursementDto } from "@/lib/dto/reimbursement";
import { getReimbursementDetails, getReceiptUrls, REIMBURSEMENT_CATEGORIES } from "@/lib/helper/reimbursement";
import { formatDateId } from "@/lib/helper/date";

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
  row: ReimbursementDto;
  checkRole: (module: string, action: string) => boolean;
  onViewDetail?: (id: string) => void;
  onView?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  deleteId?: string | null;
  setDeleteId?: React.Dispatch<React.SetStateAction<string | null>>;
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

export const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const modelName = "reimbursements";

const CATEGORIES = REIMBURSEMENT_CATEGORIES;

export const columnFormats: DefaultColumnFormat<ReimbursementDto>[] = [
  {
    key: "user",
    title: "Karyawan",
    textClassName: "font-semibold text-slate-900 dark:text-slate-100",
    formatter: (_value, row) => row.user?.name || "-",
  },
  {
    key: "title",
    title: "Judul Klaim",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => row.title || "-",
  },
  {
    key: "referenceNumber",
    title: "Nomor Referensi",
    textClassName: "font-medium text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => row.referenceNumber || "-",
  },
  {
    key: "category",
    title: "Kategori",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => [...new Set(getReimbursementDetails(row).map((detail) => detail.category))].join(", "),
  },
  {
    key: "date",
    title: "Tanggal Pengeluaran",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => [...new Set(getReimbursementDetails(row).map((detail) => formatDateId(detail.date)))].join(", "),
  },
  {
    key: "amount",
    title: "Total Pengeluaran",
    textClassName: "text-slate-700 dark:text-slate-200 font-semibold",
    formatter: (_value, row) => `Rp ${row.amount.toLocaleString("id-ID") ?? "-"}`,
  },
  {
    key: "bankName",
    title: "Bank Tujuan",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => row.bankName || "-",
  },
  {
    key: "accountNumber",
    title: "No. Rekening",
    textClassName: "text-slate-700 dark:text-slate-200",
    formatter: (_value, row) => row.accountNumber || "-",
  },
  {
    key: "receiptUrl",
    title: "Bukti Pembayaran",
    formatter: (_value, row) => {
      const details = getReimbursementDetails(row);
      const allUrls = details.flatMap((detail) => getReceiptUrls(detail));
      if (!allUrls.length) return "-";
      return (
        <div className="flex flex-wrap gap-1.5">
          {allUrls.map((url, i) => (
            <a
              key={`${i}-${url}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              title={`Lihat bukti ${i + 1}`}
              className="group relative block h-10 w-10 overflow-hidden rounded-lg border border-gray-200 shadow-sm transition-all hover:scale-105 hover:shadow-md hover:border-blue-400 dark:border-gray-600"
            >
              <img
                src={url}
                alt={`Bukti ${i + 1}`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.style.display = "none";
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector(".fallback-icon")) {
                    const fallback = document.createElement("div");
                    fallback.className = "fallback-icon flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 text-[9px] text-center leading-tight px-0.5";
                    fallback.textContent = `Bukti ${i + 1}`;
                    parent.appendChild(fallback);
                  }
                }}
              />
            </a>
          ))}
        </div>
      );
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
            Filter Data Reimbursment
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
              placeholder="Nama karyawan, judul klaim, atau nomor referensi..."
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Disetujui</SelectItem>
                <SelectItem value="rejected">Ditolak</SelectItem>
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
  onApprove,
  onReject,
  onDelete,
  deleteId,
  setDeleteId,
}: RenderActionsProps) => (
  <div className="flex justify-end gap-1">
    {checkRole(modelName, "get-by-id") && onViewDetail && (
      <Button
        variant="ghost"
        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        onClick={() => row.id && onViewDetail(row.id)}
      >
        <Printer className="w-4 h-4" />
      </Button>
    )}
    {checkRole(modelName, "approve") && row.status === "PENDING" && (
      <>
        <Button
          variant="ghost"
          className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
          onClick={() => row.id && onApprove && onApprove(row.id)}
        >
          <CheckCircle className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          color="green"
          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          onClick={() => row.id && onReject && onReject(row.id)}
        >
          <XCircle className="w-4 h-4" />
        </Button>
      </>
    )}
    {checkRole(modelName, "update") && onView && row.status === "PENDING" && (
      <Button
        variant="ghost"
        className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        onClick={() => row.id && onView(row.id)}
      >
        <Edit className="w-4 h-4" />
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
                variant="destructive"
                size="sm"
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
  </div>
);
