"use client";

import { CheckCircle, Download, Edit, ExternalLink, Filter, LogIn, LogOut, Plus, Settings, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DefaultColumnFormat } from "@/components/dynamic-page";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OvertimeConfigDto, OvertimeDto } from "@/lib/dto/overtime";
import type React from "react";
import { formatCurrency } from "@/lib/helper/format-currency";
import { formatTimeId } from "@/lib/helper/date";

function getTodayJakartaDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function formatJakartaDate(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

export const itemsPerPageOptions = [5, 10, 25, 50, 100];
export const ITEMS_PER_PAGE = 10;
const modelName = "overtimes";

interface HeaderToolbarProps {
    actions: {
        onAdd: () => void;
        onExport?: () => void;
        onOpenConfig: () => void;
        onCheckIn?: () => void;
        onCheckOut?: () => void;
        checkRole: (module: string, action: string) => boolean;
        isExporting: boolean;
    };
    overtime: {
        currentOvertime: OvertimeDto | null;
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
    };
}

interface RenderActionsProps {
    row: OvertimeDto;
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
    DRAFT: "Draft",
    CHECKED_IN: "Sedang Lembur",
    PENDING: "Menunggu",
    APPROVED: "Disetujui",
    REJECTED: "Ditolak",
};

export const STATUS_COLOR: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    CHECKED_IN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export const INITIAL_FORM_DATA: OvertimeDto = {
    id: "",
    userId: "",
    overtimeDate: "",
    startTime: null,
    endTime: null,
    overtimeMinutes: 0,
    requestedMinutes: 0,
    payMethod: "PER_HOUR",
    status: "DRAFT",
    approvalDecisions: [],
    hourlyRate: 0,
    dailyRate: 0,
    payoutAmount: 0,
    description: "",
};

export const DEFAULT_CONFIG: OvertimeConfigDto = { payMethod: "PER_HOUR", hourlyRate: 0, dailyRate: 0 };
export const columnFormats: DefaultColumnFormat<OvertimeDto>[] = [
    {
        key: "user",
        title: "Karyawan",
        textClassName: "font-semibold text-slate-900 dark:text-slate-100",
        formatter: (_value, row) => row.user?.name || "-",
    },
    {
        key: "overtimeDate",
        title: "Tanggal Lembur",
        textClassName: "text-slate-700 dark:text-slate-200",
        formatter: (_value, row) => row.overtimeDate ? new Date(row.overtimeDate).toLocaleDateString("id-ID", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
        }) : "-",
    },
    {
        key: "startTime",
        title: "Check In",
        textClassName: "text-slate-700 dark:text-slate-200",
        formatter: (_value, row) => row.startTime ? formatTimeId(row.startTime) : "-",
    },
    {
        key: "endTime",
        title: "Check Out",
        textClassName: "text-slate-700 dark:text-slate-200",
        formatter: (_value, row) => row.endTime ? formatTimeId(row.endTime) : "-",
    },
    {
        key: "description",
        title: "Keterangan",
        textClassName: "text-slate-700 dark:text-slate-200",
        formatter: (value) => (value ? String(value) : "-"),
    },
    {
        key: "overtimeMinutes",
        title: "Durasi",
        textClassName: "font-semibold text-slate-700 dark:text-slate-200",
        formatter: (value) => {
            const totalMinutes = Number(value || 0);
            if (!totalMinutes) return "-";
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return minutes ? `${hours} jam ${minutes} menit` : `${hours} jam`;
        },
    },
    {
        key: "payoutAmount",
        title: "Nominal",
        textClassName: "text-slate-700 dark:text-slate-200",
        formatter: (value) => formatCurrency(Number(value || 0)),
    },
    {
        key: "proofUrl",
        title: "Bukti Lembur",
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
        key: "approvalDecisions",
        title: "Persetujuan",
        formatter: (_value, row) => (
            <div className="flex flex-wrap gap-2">
                {row.approvalDecisions && row.approvalDecisions.map((v) => (
                    <span key={v.approverUserId} className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[v.status] ?? ""}`}>
                        {v.approverUser?.name}: {STATUS_LABEL[v.status] ?? '-'}
                    </span>

                ))}
            </div>
        ),
    },
    {
        key: "reason",
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

export const headerToolbar = ({ actions, overtime, filters }: HeaderToolbarProps) => (
    <div>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            {actions.checkRole(modelName, "set-config") && (
                <Button
                    onClick={actions.onOpenConfig}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                    <Settings className="h-4 w-4" />
                    Kelola Tarif Lembur
                </Button>
            )}

            {actions.checkRole(modelName, "create") && (
                <>
                    <Button
                        onClick={actions.onAdd}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4" />
                        Tambah Lembur
                    </Button>

                    {overtime.currentOvertime?.status === "DRAFT" && formatJakartaDate(overtime.currentOvertime.overtimeDate) === getTodayJakartaDate() ? (
                        <Button
                            onClick={actions.onCheckIn}
                            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
                        >
                            <LogIn className="h-4 w-4" />
                            Check In
                        </Button>
                    ) : overtime.currentOvertime?.status === "DRAFT" ? (
                        <Button disabled className="cursor-not-allowed bg-gray-400 text-white">
                            Draft Lewat Tanggal
                        </Button>
                    ) : overtime.currentOvertime?.status === "CHECKED_IN" ? (
                        <Button
                            onClick={actions.onCheckOut}
                            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
                        >
                            <LogOut className="h-4 w-4" />
                            Check Out
                        </Button>
                    ) : null}
                </>
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
                    <h3 className="font-semibold text-slate-900 dark:text-white">Filter Data Overtime</h3>
                    {filters.activeCount > 0 && (
                        <button onClick={filters.clear} className="flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
                            <X className="h-4 w-4" />
                            Hapus Semua Filter
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Cari</Label>
                        <Input
                            type="text"
                            value={filters.searchTerm}
                            onChange={(e) => filters.setSearchTerm(e.target.value)}
                            placeholder="Karyawan atau keterangan..."
                            className="w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                    <div>
                        <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</Label>
                        <Select value={filters.status} onValueChange={filters.setStatus}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Semua Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Status</SelectItem>
                                <SelectItem value="DRAFT">Draft</SelectItem>
                                <SelectItem value="CHECKED_IN">Sedang Lembur</SelectItem>
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
    onDelete,
    onApprove,
    onReasonReject,
    setRejectId,
    deleteId,
    setDeleteId,
}: RenderActionsProps) => {
    const currentUser =
        typeof window !== "undefined"
            ? JSON.parse(localStorage.getItem("hr_user_data") || "{}")
            : {};

    const isApprover = row.approvalDecisions?.some(
        (config) => config.approverUserId === currentUser?.id && config.status == "PENDING"
    );

    return (
        <div className="flex justify-end gap-1">
            {row.status === "PENDING" && isApprover && (
                <>
                    <Button
                        variant="ghost"
                        className="rounded-lg p-2 text-emerald-600 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        title="Setujui"
                        onClick={() => row.id && onApprove && onApprove(row.id)}
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

            {row.status === "DRAFT" && checkRole(modelName, "update") && onView && (
                <Button
                    variant="ghost"
                    className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20"
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
    )
};
