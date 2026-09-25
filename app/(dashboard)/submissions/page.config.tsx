"use client";

import type React from "react";
import { CheckCircle, Download, Edit, ExternalLink, Filter, Plus, Settings, Trash2, X, XCircle } from "lucide-react";
import type { DefaultColumnFormat } from "@/components/dynamic-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SubmissionDto } from "@/lib/dto/submission";
import type { SubmissionTypeDto } from "@/lib/dto/submission-type";
import { formatDateWithWeekdayId } from "@/lib/helper/date";

export const itemsPerPageOptions = [5, 10, 25, 50, 100];
export const ITEMS_PER_PAGE = 10;
const modelName = "submissions";

interface HeaderToolbarProps {
  actions: {
    checkRole: (module: string, action: string) => boolean;
    isExporting: boolean;
    onAdd: () => void;
    onExport?: () => void;
    onOpenLeaveConfig: () => void;
    onOpenTypeModal: () => void;
  };
  filters: {
    show: boolean;
    setShow: React.Dispatch<React.SetStateAction<boolean>>;
    activeCount: number;
    clear: () => void;
    searchTerm: string;
    setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
    status: string;
    setStatus: React.Dispatch<React.SetStateAction<string>>;
    type: string;
    setType: React.Dispatch<React.SetStateAction<string>>;
    submissionTypes: SubmissionTypeDto[];
  };
}

interface RenderActionsProps {
  row: SubmissionDto;
  checkRole: (module: string, action: string) => boolean;
  onView?: (id: string) => void;
  onDelete?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReasonReject?: () => void;
  setRejectId?: React.Dispatch<React.SetStateAction<string | null>>;
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

export const columnFormats: DefaultColumnFormat<SubmissionDto>[] = [
  {
    key: "user",
    title: "Karyawan",
    textClassName: "font-semibold text-slate-900 dark:text-slate-100",
    formatter: (_value, row) => row.user?.name ?? "-",
  },
  {
    key: "submissionType",
    title: "Jenis",
    formatter: (_value, row) => row.submissionType?.name ?? "-",
  },
  {
    key: "startDate",
    title: "Tanggal Mulai",
    formatter: (value) => formatDateWithWeekdayId(value),
  },
  {
    key: "endDate",
    title: "Tanggal Selesai",
    formatter: (value) => formatDateWithWeekdayId(value),
  },
  {
    key: "reason",
    title: "Alasan Pengajuan",
    formatter: (value) => value || "-",
  },
  {
    key: "proofUrl",
    title: "Bukti Pengajuan",
    formatter: (value) =>
      value ? (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Lihat Bukti
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        "-"
      ),
  },
  {
    key: "approvalConfigDecisions",
    title: "Persetujuan",
    formatter: (_value, row) => (
      <div className="flex flex-wrap gap-2">
        {row.approvalDecisions?.map((v) => {
          return (
            <span
              key={v.approverUserId}
              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[v.status]}`}
            >
              {v.approverUser?.name}: {v.status ? STATUS_LABEL[v.status] : "-"}
            </span>
          );
        })}
      </div>
    ),
  },
  {
    key: "rejectedDecisionReason",
    title: "Alasan Penolakan",
    formatter: (_value, row) => {
      const rejectedDecision = row.approvalDecisions?.find(
        (v) => v.status === "REJECTED"
      );

      return (
        <span>
          {rejectedDecision?.reason ?? "-"}
        </span>
      );
    },
  },
  {
    key: "status",
    title: "Status",
    formatter: (_value, row) => (
      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLOR[row.status] ?? ""}`}>
        {STATUS_LABEL[row.status] ?? row.status}
      </span>
    ),
  },
];

export const headerToolbar = ({ actions, filters }: HeaderToolbarProps) => (
  <div>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
      {actions.checkRole("submission_types", "create") && (
        <>
          <Button
            onClick={actions.onOpenTypeModal}
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            <Settings className="h-4 w-4" />
            Kelola Jenis
          </Button>
          <Button
            onClick={actions.onOpenLeaveConfig}
            className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
          >
            <Settings className="h-4 w-4" />
            Batas Cuti
          </Button>
        </>
      )}

      {actions.checkRole(modelName, "create") && (
        <Button
          onClick={actions.onAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Tambah
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
          <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
            {filters.activeCount}
          </span>
        )}
      </Button>

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
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-white">Filter Data Pengajuan</h3>
          {filters.activeCount > 0 && (
            <button
              onClick={filters.clear}
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              <X className="h-4 w-4" />
              Hapus Semua Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Cari</Label>
            <Input
              type="text"
              value={filters.searchTerm}
              onChange={(event) => filters.setSearchTerm(event.target.value)}
              placeholder="Nama karyawan..."
              className="w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Jenis Pengajuan</Label>
            <Select value={filters.type} onValueChange={filters.setType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Semua Jenis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Jenis</SelectItem>
                {filters.submissionTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</Label>
            <Select value={filters.status} onValueChange={filters.setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="PENDING">Menunggu</SelectItem>
                <SelectItem value="APPROVED">Disetujui</SelectItem>
                <SelectItem value="REJECTED">Ditolak</SelectItem>
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
  onApprove,
  onDelete,
  onReasonReject,
  setRejectId,
  deleteId,
  setDeleteId,
}: RenderActionsProps) => {
  const storedUser = localStorage.getItem("hr_user_data");
  const user = storedUser
    ? (JSON.parse(storedUser) as { id?: string })
    : null;

  const isApprover = row.approvalDecisions?.some(
    (config) => config.approverUserId === user?.id && config.status === "PENDING"
  );

  return (
    <div className="flex justify-end gap-2">
      {row.status === "PENDING" && isApprover && (
        <>
          <Button
            variant="ghost"
            className="rounded-lg p-2 text-green-600 transition-colors hover:bg-green-50 dark:hover:bg-green-900/20"
            title="Setujui"
            onClick={() => row.id && onApprove?.(row.id)}
          >
            <CheckCircle className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            title="Tolak"
            onClick={() => {
              if (row.id) {
                onReasonReject?.();
                setRejectId?.(row.id);
              }
            }}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </>
      )}

      {row.status === "PENDING" && checkRole(modelName, "update") && onView && (
        <Button
          variant="ghost"
          className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20"
          title="Edit"
          onClick={() => row.id && onView(row.id)}
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
            <Button
              variant="ghost"
              className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>

          <PopoverContent className="mr-4 w-80 rounded-xl border bg-white text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                Apakah Anda yakin ingin menghapus data ini? Tindakan ini tidak
                dapat dibatalkan.
              </p>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
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
};
