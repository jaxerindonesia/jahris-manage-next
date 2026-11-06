"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck,
  CalendarOff,
  Clock,
  Loader2,
  Printer,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserDto } from "@/lib/dto/user";
import type { EmployeeRecapDto } from "@/lib/dto/employee-recap";
import {
  buildEmployeeRecapPrintHtml,
  EMPLOYEE_RECAP_MONTHS,
  getEmployeeSubmissionStatusLabel,
} from "@/lib/helper/employee-recap-print";
import { useTenantConfig } from "@/contexts/TenantConfigContext";
import { waitForPrintImages } from "@/lib/helper/print";

type RecapData = EmployeeRecapDto;
const MONTHS = EMPLOYEE_RECAP_MONTHS;

function formatTime(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStatusBadge(status: string) {
  const s = status?.toLowerCase() || "";
  if (s === "hadir" || s === "present" || s === "tepat waktu") return "bg-green-100 text-green-700";
  if (s === "telat" || s === "late" || s === "terlambat") return "bg-yellow-100 text-yellow-700";
  if (s === "alpha" || s === "absent" || s === "tidak hadir") return "bg-red-100 text-red-700";
  if (s === "izin" || s === "cuti" || s === "sakit" || s === "leave" || s === "sick") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
}

function getSubmissionStatusBadge(status: string) {
  const s = status?.toUpperCase() || "";
  if (s === "APPROVED") return "bg-green-100 text-green-700";
  if (s === "REJECTED") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

function getSubmissionStatusLabel(status: string) {
  return getEmployeeSubmissionStatusLabel(status);
}

export default function RecapModal({
  employee,
  onClose,
}: {
  employee: UserDto;
  onClose: () => void;
}) {
  const tenantConfig = useTenantConfig();
  const now = new Date();
  const [activeTab, setActiveTab] = useState<"attendance" | "submissions">("attendance");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RecapData | null>(null);

  const fetchRecap = useCallback(async () => {
    if (!employee.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${employee.id}/recap?month=${month}&year=${year}`);
      if (!res.ok) throw new Error("Failed to fetch recap");
      const json = await res.json();
      setData(json.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [employee.id, month, year]);

  useEffect(() => {
    fetchRecap();
  }, [fetchRecap]);

  const currentYear = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const summary = data?.attendance.summary;
  const attendanceDetails = data?.attendance.details || [];
  const submissionHistory = data?.submissions.history || [];
  const leaveQuotas = data?.submissions.leaveQuotas || [];


  const handlePrint = async () => {
    if (!data) return;

    const printDiv = document.createElement("div");
    printDiv.id = "temp-print-area";
    printDiv.innerHTML = buildEmployeeRecapPrintHtml([
      {
        employee,
        recap: data,
        brand: {
          companyName: tenantConfig?.companyName || employee.tenant?.companyName,
          logoUrl: tenantConfig?.logoUrl || employee.tenant?.logoUrl,
        },
      },
    ]);
    document.body.appendChild(printDiv);

    const style = document.createElement("style");
    style.id = "temp-print-style";
    style.innerHTML = `@media print {
      body > *:not(#temp-print-area) { display: none !important; }
      #temp-print-area { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; background: white !important; z-index: 99999 !important; }
      #temp-print-area * { visibility: visible !important; }
      body, html { height: auto !important; overflow: visible !important; background: white !important; }
    }`;
    document.head.appendChild(style);

    await waitForPrintImages(printDiv);

    const cleanup = () => {
      printDiv.remove();
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 60000);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex max-h-[90vh] w-[56vw] max-w-[56vw] flex-col overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:w-[56vw] sm:!max-w-[1400px] sm:rounded-2xl sm:border sm:border-gray-200 dark:bg-gray-900 sm:dark:border-gray-700">
        <DialogHeader className="sr-only">
          <DialogTitle>Rekap Karyawan</DialogTitle>
          <DialogDescription>
            Ringkasan kehadiran dan pengajuan ketidakhadiran karyawan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b bg-gray-50/90 px-4 py-5 pr-14 sm:px-8 sm:py-6 sm:pr-16 dark:bg-gray-800/40">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1 space-y-4 w-full">
                <div className="flex flex-col gap-3 xl:flex-row xl:justify-between xl:items-start">
                  <div>

                    <p className="text-2xl font-bold text-gray-800 dark:text-white">
                      {employee.name}
                    </p>
                    <p className="font-medium mb-2 text-gray-500 dark:text-white">
                      {employee.position || "Posisi belum diatur"} • Departemen {employee.department?.name || "belum diatur"} • Cabang {employee.branch?.name || "belum ditentukan"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handlePrint}
                    className="print-hide flex items-center gap-2 self-start"
                  >
                    <Printer className="w-4 h-4" />
                    Cetak / Simpan PDF
                  </Button>
                </div>

                <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-4 text-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">NIK</span>
                    <span className="text-gray-900 dark:text-gray-200 font-semibold">{employee.nik || "-"}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Gender</span>
                    <span className="text-gray-900 dark:text-gray-200 font-semibold">
                      {employee.gender === "male" ? "Laki-laki" : employee.gender === "female" ? "Perempuan" : "-"}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Email</span>
                    <span className="text-gray-900 dark:text-gray-200 font-semibold break-words">{employee.email || "-"}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Lahir</span>
                    <span className="text-gray-900 dark:text-gray-200 font-semibold">
                      {employee.birthPlace ? `${employee.birthPlace}, ` : ""}
                      {employee.birthDate ? formatDate(employee.birthDate as string) : "-"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:col-span-2 xl:col-span-4 border-t dark:border-gray-700/50 pt-3 mt-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Alamat</span>
                    <span className="text-gray-900 dark:text-gray-200 font-semibold break-words">{employee.address || "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 px-4 pt-5 sm:px-8">
            <div className="grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded-lg h-12 dark:bg-gray-800">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("attendance")}
                className={`h-full px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center ${
                  activeTab === "attendance"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Rekap Kehadiran
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("submissions")}
                className={`h-full px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center ${
                  activeTab === "submissions"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Pengajuan Ketidakhadiran
              </Button>
            </div>
          </div>

          <div className="shrink-0 px-4 pt-4 sm:px-8">
            <div className="flex flex-wrap gap-3 items-center rounded-xl border dark:border-gray-700 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Bulan:</span>
                <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                  <SelectTrigger className="w-[140px] bg-white dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((name, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Tahun:</span>
                <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                  <SelectTrigger className="w-[100px] bg-white dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 pb-6 pt-4 sm:px-8 sm:pb-8">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-500 dark:text-gray-400">Memuat data...</span>
              </div>
            ) : activeTab === "attendance" ? (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Ringkasan Kehadiran - {MONTHS[month - 1]} {year}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-xs font-medium text-green-700 dark:text-green-400">Hadir</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">{summary?.totalHadir || 0}</p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Telat</span>
                    </div>
                    <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{summary?.totalTelat || 0}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <span className="text-xs font-medium text-red-700 dark:text-red-400">Alpha</span>
                    </div>
                    <p className="text-2xl font-bold text-red-700 dark:text-red-300">{summary?.totalAlpha || 0}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarOff className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Izin/Cuti</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{summary?.totalIzin || 0}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Detail Kehadiran - {MONTHS[month - 1]} {year}
                  </h3>
                  <div className="overflow-x-auto border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-transparent">
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Tanggal</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Jam Masuk</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Jam Keluar</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Status</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Jam Kerja</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Catatan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attendanceDetails.length > 0 ? (
                          attendanceDetails.map((att) => (
                            <TableRow key={att.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <TableCell className="p-3 whitespace-nowrap dark:text-gray-300">{formatDate(att.date)}</TableCell>
                              <TableCell className="p-3 dark:text-gray-300">{formatTime(att.checkIn)}</TableCell>
                              <TableCell className="p-3 dark:text-gray-300">{formatTime(att.checkOut)}</TableCell>
                              <TableCell className="p-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(att.status)}`}>
                                  {att.status || "-"}
                                </span>
                              </TableCell>
                              <TableCell className="p-3 dark:text-gray-300">{att.workHours || "-"}</TableCell>
                              <TableCell className="p-3 dark:text-gray-300 max-w-[220px] truncate">{att.notes || "-"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">
                              Tidak ada data kehadiran untuk bulan ini
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Ringkasan Pengajuan - Tahun {year}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {leaveQuotas.length > 0 ? (
                      leaveQuotas.map((quota, i) => (
                        <div key={i} className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{quota.configName}</p>
                          <div className="flex items-end gap-1">
                            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{quota.remainingDays}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 mb-0.5">/ {quota.maxDays} hari</span>
                          </div>
                          <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                quota.remainingDays === 0
                                  ? "bg-red-500"
                                  : quota.remainingDays <= 3
                                    ? "bg-yellow-500"
                                    : "bg-blue-500"
                              }`}
                              style={{
                                width: `${Math.max(0, (quota.remainingDays / quota.maxDays) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Terpakai: {quota.usedDays} hari</p>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full border dark:border-gray-700 rounded-lg p-6 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800">
                        Belum ada data kuota cuti.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Riwayat Pengajuan - Tahun {year}
                  </h3>
                  <div className="overflow-x-auto border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-transparent">
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Jenis</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Tanggal Mulai</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Tanggal Selesai</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Alasan</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Status</TableHead>
                          <TableHead className="p-3 font-semibold dark:text-gray-300">Diajukan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submissionHistory.length > 0 ? (
                          submissionHistory.map((sub) => (
                            <TableRow key={sub.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <TableCell className="p-3 font-medium dark:text-gray-300">{sub.type}</TableCell>
                              <TableCell className="p-3 whitespace-nowrap dark:text-gray-300">{formatDate(sub.startDate)}</TableCell>
                              <TableCell className="p-3 whitespace-nowrap dark:text-gray-300">{formatDate(sub.endDate)}</TableCell>
                              <TableCell className="p-3 max-w-[220px] truncate dark:text-gray-300">{sub.reason || "-"}</TableCell>
                              <TableCell className="p-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSubmissionStatusBadge(sub.status)}`}>
                                  {getSubmissionStatusLabel(sub.status)}
                                </span>
                              </TableCell>
                              <TableCell className="p-3 whitespace-nowrap dark:text-gray-300">{formatDate(sub.createdAt)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">
                              Tidak ada pengajuan untuk tahun ini
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
