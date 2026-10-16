"use client";

import type React from "react";
import Image from "next/image";
import {
  CheckCircle,
  Clock,
  Coffee,
  Flag,
  Download,
  Eye,
  Filter,
  Settings,
  Trash2,
  X,
  XCircle,
  LogIn,
  LogOut,
  Loader2,
} from "lucide-react";
import type { DefaultColumnFormat } from "@/components/dynamic-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AttendanceDto } from "@/lib/dto/attendance";
import { formatDateWithWeekdayId, formatTimeId } from "@/lib/helper/date";

export const itemsPerPageOptions = [5, 10, 25, 50, 100];
export const ITEMS_PER_PAGE = 10;
const modelName = "attendances";

export const STATUS_LABEL: Record<string, string> = {
  "On Time": "Tepat Waktu",
  Present: "Hadir",
  Lembur: "Lembur",
  Late: "Terlambat",
  "Late - Present": "Telat - Hadir",
  "Late - Half Day": "Telat - Setengah Hari",
  Absent: "Tidak Hadir",
  "Half Day": "Setengah Hari",
};

export const STATUS_OPTIONS = [
  { value: "On Time", label: "Tepat Waktu" },
  { value: "Present", label: "Hadir" },
  { value: "Lembur", label: "Lembur" },
  { value: "Late", label: "Terlambat" },
  { value: "Late - Present", label: "Telat - Hadir" },
  { value: "Late - Half Day", label: "Telat - Setengah Hari" },
  { value: "Absent", label: "Tidak Hadir" },
  { value: "Half Day", label: "Setengah Hari" },
];

export function getStatusColor(status: string) {
  switch (status) {
    case "Present":
    case "On Time":
    case "Lembur":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Late":
    case "Late - Present":
    case "Late - Half Day":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "Absent":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "Half Day":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    default:
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "Present":
    case "On Time":
    case "Lembur":
      return <CheckCircle className="h-4 w-4" />;
    case "Late":
    case "Late - Present":
    case "Late - Half Day":
    case "Half Day":
      return <Clock className="h-4 w-4" />;
    case "Absent":
      return <XCircle className="h-4 w-4" />;
    default:
      return <Flag className="h-4 w-4" />;
  }
}

function getLastBreakSession(row: AttendanceDto) {
  const sessions = row.breakSessions ?? [];
  return sessions.length > 0 ? sessions[sessions.length - 1] : null;
}

function isOvertimeAttendance(row: AttendanceDto) {
  return (
    row.status === "Lembur" ||
    row.notes?.toLowerCase().includes("from overtime") ||
    false
  );
}

type AttendanceConfigLike = {
  breakEnabled: boolean;
};

interface HeaderToolbarProps {
  actions: {
    checkRole: (module: string, action: string) => boolean;
    isExporting: boolean;
    onExport?: () => void;
    onBreakCheckIn: () => void;
    onBreakCheckOut: () => void;
    onCheckIn: () => void;
    onCheckOut: () => void;
    onOpenConfig: () => void;
  };
  attendance: {
    attendanceConfig: {
      breakEnabled: boolean;
      officeEndTime: string;
      officeStartTime: string;
      effectiveWorkSchedule?: {
        source: "REGULAR" | "SHIFT";
        startTime: string;
        endTime: string;
        shiftName: string | null;
      } | null;
    };
    currentDateLabel: string;
    currentTime: string;
    faceCameraPreparing: boolean;
    hasBreakSession: boolean;
    locationChecking: boolean;
    locationReady: boolean;
    locationWarning: string;
    openBreakSession: NonNullable<AttendanceDto["breakSessions"]>[number] | undefined;
    todayAttendance: AttendanceDto | null;
  };
  filters: {
    activeCount: number;
    clear: () => void;
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    show: boolean;
    setShow: React.Dispatch<React.SetStateAction<boolean>>;
    status: string;
    setStatus: React.Dispatch<React.SetStateAction<string>>;
  };
  isAdmin: boolean;
}

interface RenderActionsProps {
  row: AttendanceDto;
  checkRole: (module: string, action: string) => boolean;
  onDelete?: (id: string) => void;
  onView?: (row: AttendanceDto) => void;
  deleteId?: string | null;
  setDeleteId?: React.Dispatch<React.SetStateAction<string | null>>;
}

export function getColumnFormats({
  attendanceConfig,
  isAdmin,
}: {
  attendanceConfig: AttendanceConfigLike;
  isAdmin: boolean;
}): DefaultColumnFormat<AttendanceDto>[] {
  const columns: DefaultColumnFormat<AttendanceDto>[] = [];

  if (isAdmin) {
    columns.push({
      key: "user",
      title: "Karyawan",
      textClassName: "font-semibold text-slate-900 dark:text-slate-100",
      formatter: (_value, row) => row.user?.name ?? "-",
    });
  }

  columns.push(
    {
      key: "date",
      title: "Tanggal",
      textClassName: "font-medium text-slate-900 dark:text-slate-100",
      formatter: (_value, row) => formatDateWithWeekdayId(row.date),
    },
    {
      key: "checkIn",
      title: "Check In",
      formatter: (_value, row) => formatTimeId(row.checkIn),
    },
    {
      key: "checkOut",
      title: "Check Out",
      formatter: (_value, row) => formatTimeId(row.checkOut),
    },
  );

  if (attendanceConfig.breakEnabled) {
    columns.push(
      {
        key: "breakIn",
        title: "Break In",
        formatter: (_value, row) => formatTimeId(row.breakSessions?.[0]?.breakIn),
      },
      {
        key: "breakOut",
        title: "Break Out",
        formatter: (_value, row) => formatTimeId(getLastBreakSession(row)?.breakOut),
      },
      {
        key: "breakDuration",
        title: "Durasi Istirahat",
        formatter: (value) => (value ? String(value) : "-"),
      },
    );
  }

  columns.push(
    {
      key: "workHours",
      title: "Jam Kerja",
      textClassName: "font-medium text-slate-700 dark:text-slate-200",
      formatter: (value) => (value ? String(value) : "-"),
    },
    {
      key: "status",
      title: "Status",
      formatter: (_value, row) => (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(
              row.status,
            )}`}
          >
            {getStatusIcon(row.status)}
            {STATUS_LABEL[row.status] ?? row.status}
          </span>
          {isOvertimeAttendance(row) ? (
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              Dari Lembur
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "proof",
      title: "Bukti",
      formatter: (_value, row) => (
        <div className="flex items-center gap-2 min-w-[90px]">
          {row.checkInFaceImage ? (
            <a
              href={row.checkInFaceImage}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              title="Bukti Check In"
            >
              <Image
                src={row.checkInFaceImage}
                alt="Bukti check in"
                width={40}
                height={40}
                className="h-10 w-10 rounded object-cover"
                unoptimized
              />
            </a>
          ) : (
            <span className="text-xs text-gray-400">CI: -</span>
          )}
          {row.checkOutFaceImage ? (
            <a
              href={row.checkOutFaceImage}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              title="Bukti Check Out"
            >
              <Image
                src={row.checkOutFaceImage}
                alt="Bukti check out"
                width={40}
                height={40}
                className="h-10 w-10 rounded object-cover"
                unoptimized
              />
            </a>
          ) : (
            <span className="text-xs text-gray-400">CO: -</span>
          )}
        </div>
      ),
    },
  );

  return columns;
}

export const headerToolbar = ({ actions, attendance, filters, isAdmin }: HeaderToolbarProps) => (
  <div>
    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-3 py-2 sm:w-auto sm:min-w-[185px] dark:border-slate-600 dark:from-slate-800 dark:to-slate-700">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-300">
            {attendance.currentDateLabel}
          </div>
          <div className="mt-1 text-xl font-bold leading-none tracking-tight text-slate-900 dark:text-white">
            {attendance.currentTime}
          </div>
          <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-600">
            {attendance.attendanceConfig.effectiveWorkSchedule ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-300">
                  {attendance.attendanceConfig.effectiveWorkSchedule.source === "SHIFT"
                    ? attendance.attendanceConfig.effectiveWorkSchedule.shiftName || "Shift"
                    : "Reguler"}
                </span>
                <span className="inline-flex items-center rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {attendance.attendanceConfig.effectiveWorkSchedule.startTime}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                <span className="inline-flex items-center rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {attendance.attendanceConfig.effectiveWorkSchedule.endTime}
                </span>
              </div>
            ) : isAdmin ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-300">Default tenant</span>
                <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-600 dark:text-slate-100">
                  {attendance.attendanceConfig.officeStartTime}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-600 dark:text-slate-100">
                  {attendance.attendanceConfig.officeEndTime}
                </span>
              </div>
            ) : (
              <span className="mt-1 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                Tidak ada jadwal hari ini
              </span>
            )}
          </div>
        </div>

        {actions.checkRole(modelName, "create") && (
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {!attendance.todayAttendance ? (
                <Button disabled={attendance.faceCameraPreparing} onClick={actions.onCheckIn} className="w-full bg-green-600 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto">
                  {attendance.faceCameraPreparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                  {attendance.faceCameraPreparing ? "Menyiapkan..." : "Check In"}
                </Button>
              ) : attendance.todayAttendance && !attendance.todayAttendance.checkOut ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button disabled={attendance.faceCameraPreparing} onClick={actions.onCheckOut} className="w-full bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto">
                    {attendance.faceCameraPreparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                    {attendance.faceCameraPreparing ? "Menyiapkan..." : "Check Out"}
                  </Button>
                  {attendance.attendanceConfig.breakEnabled &&
                    (attendance.openBreakSession ? (
                      <Button
                        onClick={actions.onBreakCheckOut}
                        className="w-full bg-amber-600 text-white hover:bg-amber-700 sm:w-auto"
                      >
                        <Coffee className="mr-2 h-4 w-4" />
                        Break Check Out
                      </Button>
                    ) : !attendance.hasBreakSession ? (
                      <Button onClick={actions.onBreakCheckIn} variant="outline" className="w-full sm:w-auto">
                        <Coffee className="mr-2 h-4 w-4" />
                        Break Check In
                      </Button>
                    ) : null)}
                </div>
              ) : (
                <Button disabled className="w-full cursor-not-allowed justify-center bg-gray-400 text-center text-white sm:w-auto">
                  Sudah Absen Hari Ini
                </Button>
              )}
            </div>

            {attendance.locationChecking ? (
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Memeriksa izin lokasi...</p>
            ) : !attendance.locationReady ? (
              <p className="text-xs leading-5 text-amber-600 dark:text-amber-400">
                {attendance.locationWarning ||
                  "Jika prompt lokasi belum muncul, tekan tombol Check In/Out untuk memicu izin lokasi."}
              </p>
            ) : null}
          </div>
        )}

        {actions.checkRole(modelName, "set-config") && (
          <Button
            variant="outline"
            onClick={actions.onOpenConfig}
            className="flex w-full items-center justify-center gap-2 sm:w-auto"
          >
            <Settings className="h-4 w-4" />
            Konfigurasi Kehadiran
          </Button>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center xl:w-auto">
        <Button
          variant="outline"
          onClick={() => filters.setShow(!filters.show)}
          className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 transition-colors ${
            filters.show || filters.activeCount > 0
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
    </div>

    {filters.show && (
      <div className="mb-6 rounded-lg border bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/50">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-white">Filter Data Kehadiran</h3>
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

        <div className={`grid grid-cols-1 gap-4 ${isAdmin ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
          {isAdmin ? (
            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Cari</Label>
              <Input
                type="text"
                value={filters.searchQuery}
                onChange={(event) => filters.setSearchQuery(event.target.value)}
                placeholder="Nama karyawan..."
                className="w-full rounded-lg border bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          ) : null}
          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</Label>
            <Select value={filters.status} onValueChange={filters.setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
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
  onDelete,
  onView,
  deleteId,
  setDeleteId,
}: RenderActionsProps) => (
  <div className="flex justify-end gap-2">
    {checkRole(modelName, "get-by-id") && (
      <Button
        variant="ghost"
        className="rounded-lg p-2 text-indigo-600 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
        onClick={() => onView?.(row)}
      >
        <Eye className="h-4 w-4" />
      </Button>
    )}

    {checkRole(modelName, "delete") && onDelete ? (
      <Popover
        open={deleteId === row.id}
        onOpenChange={(open) => setDeleteId?.(open ? row.id : null)}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="mr-4 w-56 space-y-3">
          <p className="text-sm">Yakin ingin menghapus data ini?</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setDeleteId?.(null)}>
              Batal
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onDelete(row.id)}>
              Hapus
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    ) : null}
  </div>
);
