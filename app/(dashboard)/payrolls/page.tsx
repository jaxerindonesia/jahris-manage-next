"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DynamicPage from "@/components/dynamic-page";
import type { PayrollDto } from "@/lib/dto/payroll";
import { toast } from "sonner";
import FormData from "./components/form-data";
import SlipGajiModal from "./components/slip-gaji-modal";
import PayrollComponentConfigModal from "./components/payroll-component-config-modal";
import { usePermission } from "@/lib/helper/check-role";
import { months } from "@/lib/helper/date";
import { ITEMS_PER_PAGE, columnFormats, headerToolbar, renderActions } from "./page.config";
import { AlertTriangle, CheckCircle, Clock, Loader2, Trash2 } from "lucide-react";
import PaymentDialog from "./components/payment-dialog";
import type { PayrollPaymentPhase } from "./types";
import SummaryCard from "./components/summary-card";
import type { ApiResponse } from "@/lib/utils";
import { parseApiError } from "@/lib/helper/response-api";
import { buildPayrollBulkPrintHtml } from "@/lib/helper/payroll-bulk-print";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ExportPeriodDialog, { type ExportPeriod } from "@/components/export-period-dialog";

function buildPayrollExportParams(
  period: Pick<ExportPeriod, "startDate" | "endDate">,
  search: string,
  status: string,
) {
  const params = new URLSearchParams({ page: "1", limit: "999999", activeEmployeesOnly: "true" });
  if (search) params.set("search", search);
  params.set("startDate", period.startDate);
  params.set("endDate", period.endDate);
  if (status !== "all") params.set("status", status);
  return params;
}

export default function Page() {
  const { checkRole } = usePermission();
  const [data, setData] = useState<PayrollDto[]>([]);
  const [payrollSummary, setPayrollSummary] = useState({ paid: 0, pending: 0, total: 0 });
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<PayrollDto | undefined>(undefined);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filterPeriodMode, setFilterPeriodMode] = useState<"month" | "range">("month");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [debouncedFilterYear, setDebouncedFilterYear] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"excel" | "pdf" | null>(null);

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkPaidModal, setShowBulkPaidModal] = useState(false);
  const [bulkPaidPhase, setBulkPaidPhase] = useState<PayrollPaymentPhase>("confirm");
  const isBulkUpdating = bulkPaidPhase === "processing";
  const paymentRequestPending = useRef(false);
  const [bulkPaidCount, setBulkPaidCount] = useState(0);
  const [bulkDeletePhase, setBulkDeletePhase] = useState<"confirm" | "processing" | "success">("confirm");
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);

  const currentYear = new Date().getFullYear();
  const fetchPayrollSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/payrolls/summary?year=${currentYear}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal memuat ringkasan payroll");
      setPayrollSummary({
        paid: Number(json.data?.paid) || 0,
        pending: Number(json.data?.pending) || 0,
        total: Number(json.data?.total) || 0,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat ringkasan payroll");
    }
  }, [currentYear]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)), [total]);
  const pendingSelectedIds = useMemo(
    () => data.flatMap((item) =>
      item.id && selectedIds.has(item.id) && item.status === "PENDING" ? [item.id] : [],
    ),
    [data, selectedIds],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (filterPeriodMode === "month") {
      if (filterMonth !== "all") count++;
      if (filterYear !== "all") count++;
    } else {
      if (filterStartDate) count++;
      if (filterEndDate) count++;
    }
    if (filterStatus !== "all") count++;
    return count;
  }, [searchTerm, filterPeriodMode, filterMonth, filterYear, filterStartDate, filterEndDate, filterStatus]);

  const summaryCards = useMemo(() => {
    return [
      {
        label: "Gaji Dibayarkan",
        value: payrollSummary.paid,
        subtitle: `Tahun ${currentYear}`,
        tone: "emerald",
        icon: CheckCircle,
      },
      {
        label: "Gaji Pending",
        value: payrollSummary.pending,
        subtitle: `Tahun ${currentYear}`,
        tone: "amber",
        icon: Clock,
      },
      {
        label: "Total Gaji",
        value: payrollSummary.total,
        subtitle: `Tahun ${currentYear}`,
        tone: "violet",
        icon: CheckCircle,
      },
    ];
  }, [payrollSummary, currentYear]);

  const clearFilters = useCallback(() => {
    setFilterPeriodMode("month");
    setFilterMonth("all");
    setFilterYear("all");
    setDebouncedFilterYear("all");
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterStatus("all");
    setSearchTerm("");
  }, []);

  const onAdd = useCallback(() => {
    setDetailItem(undefined);
    setShowFormModal(true);
  }, []);

  const onView = async (id: string) => {
    await fetchDetail(id);
    setShowFormModal(true);
  };

  const onViewDetail = async (id: string) => {
    await fetchDetail(id);
    setShowDetailModal(true);
  };

  const onDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/payrolls/${id}`, { method: "DELETE" });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gaji berhasil dihapus");

      toast.success("Gaji berhasil dihapus!");
      await Promise.all([fetchData(), fetchPayrollSummary()]);
    } catch (error) {
      toast.error(`Gagal menghapus gaji: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDeleteId(null);
    }
  };

  const onBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setIsBulkDeleting(true);
    setBulkDeletePhase("processing");
    try {
      const res = await fetch("/api/payrolls/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal menghapus payroll terpilih");
      toast.success(json.message || `${ids.length} payroll berhasil dihapus`);
      const deletedCount = Number(json.deletedCount || ids.length);
      setData((current) => current.filter((item) => !item.id || !selectedIds.has(item.id)));
      setTotal((current) => Math.max(0, current - deletedCount));
      await fetchPayrollSummary();
      setSelectedIds(new Set());
      setBulkDeletePhase("success");
      await new Promise((resolve) => window.setTimeout(resolve, 1400));
      setShowBulkDeleteModal(false);
    } catch (error) {
      setBulkDeletePhase("confirm");
      toast.error(error instanceof Error ? error.message : "Gagal menghapus payroll terpilih");
    } finally {
      setIsBulkDeleting(false);
    }
  }, [fetchPayrollSummary, selectedIds]);

  const onBulkMarkPaid = useCallback(async () => {
    if (!pendingSelectedIds.length || paymentRequestPending.current) return;
    paymentRequestPending.current = true;
    setBulkPaidPhase("processing");
    try {
      const res = await fetch("/api/payrolls/bulk-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: pendingSelectedIds, status: "PAID" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal memperbarui status payroll");

      const updatedIds = new Set<string>(json.updatedIds || pendingSelectedIds);
      const paidAt = json.paidAt ? new Date(json.paidAt) : new Date();
      setData((current) => current.map((item) =>
        item.id && updatedIds.has(item.id) ? { ...item, status: "PAID", paidAt } : item,
      ));
      await fetchPayrollSummary();
      setSelectedIds(new Set());
      setBulkPaidCount(updatedIds.size);
      setBulkPaidPhase("success");
    } catch (error) {
      setBulkPaidPhase("confirm");
      toast.error(error instanceof Error ? error.message : "Gagal memperbarui status payroll");
    } finally {
      paymentRequestPending.current = false;
    }
  }, [fetchPayrollSummary, pendingSelectedIds]);

  useEffect(() => {
    if (!showBulkPaidModal || bulkPaidPhase !== "success") return;
    const timeout = window.setTimeout(() => setShowBulkPaidModal(false), 3200);
    return () => window.clearTimeout(timeout);
  }, [showBulkPaidModal, bulkPaidPhase]);

  const onExport = useCallback(async (period: ExportPeriod) => {
    const { startDate, endDate } = period;
    if (!startDate || !endDate || startDate > endDate) {
      toast.error("Pilih rentang tanggal yang valid");
      return;
    }
    setIsExporting(true);
    try {
      const params = buildPayrollExportParams(period, debouncedSearchTerm, filterStatus);

      const res = await fetch(`/api/payrolls?${params.toString()}`);
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data untuk export"),
        );
      }

      const json = await res.json();
      const allData: PayrollDto[] = json.data || [];
      if (!allData.length) throw new Error("Tidak ada payroll sesuai filter yang dipilih");
      const XLSX = await import("xlsx");

      const rows = allData.map((emp) => ({
        "Nama Karyawan": emp.user?.name ?? "-",
        Cabang: emp.user?.branch?.name ?? "-",
        "Nomor Referensi": emp.referenceNumber ?? "-",
        Bulan: emp.periodStartDate && emp.periodEndDate ? "-" : `${months.find((item) => item.value === emp.month)?.label ?? emp.month} ${emp.year}`,
        Periode: emp.periodStartDate && emp.periodEndDate
          ? `${new Date(emp.periodStartDate).toLocaleDateString("id-ID")} s/d ${new Date(emp.periodEndDate).toLocaleDateString("id-ID")}`
          : "-",
        "Gaji Pokok": emp.basicSalary,
        Tunjangan: emp.allowances,
        Potongan: emp.deductions,
        "Total Gaji": emp.totalSalary,
        Status: emp.status === "PAID" ? "Dibayar" : "Pending",
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Payroll");

      const fileName = `data-payroll-${startDate}_${endDate}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setExportFormat(null);
      toast.success(`Berhasil mengexport ${allData.length} data payroll`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengexport data",
      );
    } finally {
      setIsExporting(false);
    }
  }, [debouncedSearchTerm, filterStatus]);

  const onPrintAll = useCallback(async ({ startDate, endDate }: ExportPeriod) => {
    if (!startDate || !endDate || startDate > endDate) {
      toast.error("Pilih rentang tanggal yang valid");
      return;
    }
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      toast.error("Popup PDF diblokir browser. Izinkan popup lalu coba lagi.");
      return;
    }
    try {
      setIsExporting(true);
      printWindow.document.write("<p style='font-family:Arial;padding:24px'>Menyiapkan PDF seluruh slip payroll...</p>");
      const params = buildPayrollExportParams({ startDate, endDate }, debouncedSearchTerm, filterStatus);
      const res = await fetch(`/api/payrolls?${params.toString()}`);
      if (!res.ok) throw new Error(await parseApiError(res, "Gagal mengambil seluruh payroll"));
      const json = await res.json();
      const payrolls: PayrollDto[] = json.data ?? [];
      if (!payrolls.length) throw new Error("Tidak ada payroll sesuai filter yang dipilih");
      let brand: { companyName?: string; logoUrl?: string } = {};
      try {
        const user = JSON.parse(localStorage.getItem("hr_user_data") || "{}");
        brand = { companyName: user.companyName || user.tenantName, logoUrl: user.logoDarkUrl || user.logoUrl || user.tenantLogoDarkUrl || user.tenantLogoUrl };
      } catch { /* gunakan identitas default */ }
      printWindow.document.open();
      printWindow.document.write(buildPayrollBulkPrintHtml(payrolls, brand));
      printWindow.document.close();
      setExportFormat(null);
      const doPrint = () => { printWindow.focus(); printWindow.print(); printWindow.onafterprint = () => printWindow.close(); };
      if (printWindow.document.readyState === "complete") window.setTimeout(doPrint, 300);
      else printWindow.onload = () => window.setTimeout(doPrint, 300);
    } catch (error) {
      printWindow.close();
      toast.error(error instanceof Error ? error.message : "Gagal mencetak seluruh payroll");
    } finally {
      setIsExporting(false);
    }
  }, [debouncedSearchTerm, filterStatus]);

  const toolbar = useMemo(() => {
    return headerToolbar({
      actions: {
        onAdd,
        onExport: () => setExportFormat("excel"),
        onPrintAll: () => setExportFormat("pdf"),
        onOpenConfig: () => setShowConfigModal(true),
        checkRole,
        isExporting,
        selectedCount: selectedIds.size,
        onBulkDelete: () => {
          setBulkDeleteCount(selectedIds.size);
          setBulkDeletePhase("confirm");
          setShowBulkDeleteModal(true);
        },
        isBulkDeleting,
        pendingSelectedCount: pendingSelectedIds.length,
        onBulkMarkPaid: () => {
          setBulkPaidCount(pendingSelectedIds.length);
          setBulkPaidPhase("confirm");
          setShowBulkPaidModal(true);
        },
        isBulkUpdating,
      },
      filters: {
        show: showFilterPanel,
        setShow: setShowFilterPanel,
        activeCount: activeFilterCount,
        clear: clearFilters,
        searchTerm,
        setSearchTerm,
        periodMode: filterPeriodMode,
        setPeriodMode: setFilterPeriodMode,
        status: filterStatus,
        setStatus: setFilterStatus,
        month: filterMonth,
        setMonth: setFilterMonth,
        year: filterYear,
        setYear: setFilterYear,
        startDate: filterStartDate,
        setStartDate: setFilterStartDate,
        endDate: filterEndDate,
        setEndDate: setFilterEndDate,
      },
    })
  }, [searchTerm, filterStatus, filterPeriodMode, filterMonth, filterYear, filterStartDate, filterEndDate, activeFilterCount, clearFilters, onAdd, isBulkDeleting, isBulkUpdating, isExporting, pendingSelectedIds.length, selectedIds.size, checkRole, showFilterPanel]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterPeriodMode === "month") {
        if (filterMonth !== "all") params.set("month", filterMonth);
        if (debouncedFilterYear !== "all") params.set("year", debouncedFilterYear);
      } else {
        if (filterStartDate) params.set("startDate", filterStartDate);
        if (filterEndDate) params.set("endDate", filterEndDate);
      }
      if (filterStatus !== "all") params.set("status", filterStatus);

      const res = await fetch(`/api/payrolls?${params.toString()}`);
      const json: ApiResponse = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          (json as { message?: string })?.message || "Gagal memuat data payroll",
        );
      }

      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat data payroll",
      );
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedFilterYear, debouncedSearchTerm, filterEndDate, filterMonth, filterPeriodMode, filterStartDate, filterStatus]);

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payrolls/${id}`);
      if (!res.ok) {
        throw new Error(await parseApiError(res, "Gagal memuat detail payroll"));
      }
      const json = await res.json();
      setDetailItem(json.data || undefined);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat detail payroll",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchPayrollSummary();
  }, [fetchPayrollSummary]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedFilterYear(filterYear.trim() || "all");
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [filterYear]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filterPeriodMode, filterMonth, debouncedFilterYear, filterStartDate, filterEndDate, filterStatus]);

  return (
    <>
      {/* Card History Payroll */}
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        {summaryCards.map((card) => (
          <SummaryCard
            key={card.label}
            label={card.label}
            value={card.value}
            subtitle={card.subtitle}
            tone={card.tone}
            icon={card.icon}
          />
        ))}
      </div>

      <DynamicPage
        toolbar={toolbar}
        columns={columnFormats}
        items={data}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        loading={loading}
        emptyMessage="Belum ada data payroll"
        onPageChange={setCurrentPage}
        selectedRowIds={checkRole("payrolls", "delete") ? selectedIds : undefined}
        onRowSelectionChange={(id, selected) => {
          setSelectedIds((current) => {
            const next = new Set(current);
            if (selected) next.add(id); else next.delete(id);
            return next;
          });
        }}
        onSelectAllChange={(selected) => {
          setSelectedIds((current) => {
            const next = new Set(current);
            data.forEach((row) => {
              if (!row.id) return;
              if (selected) next.add(row.id); else next.delete(row.id);
            });
            return next;
          });
        }}
        renderActions={(row) => renderActions({ row, checkRole, onView, onViewDetail, onDelete, deleteId, setDeleteId })}
      />

      {/* ─── Create/Edit Modal ─── */}
      <PaymentDialog
        open={showBulkPaidModal}
        phase={bulkPaidPhase}
        count={bulkPaidCount}
        onClose={() => setShowBulkPaidModal(false)}
        onConfirm={onBulkMarkPaid}
      />

      {exportFormat && checkRole("payrolls", "export") && (
        <ExportPeriodDialog
          loading={isExporting}
          onOpenChange={(open) => !open && setExportFormat(null)}
          onConfirm={exportFormat === "excel" ? onExport : onPrintAll}
          title={exportFormat === "excel" ? "Download Payroll Excel" : "Download Payroll PDF"}
          submitLabel={exportFormat === "excel" ? "Download Excel" : "Download PDF"}
          description="Pilih rentang tanggal payroll yang akan didownload. Filter pencarian dan status yang aktif tetap diterapkan."
          idPrefix={`payroll-${exportFormat}`}
        />
      )}

      <Dialog open={showBulkDeleteModal} onOpenChange={(open) => !isBulkDeleting && setShowBulkDeleteModal(open)}>
        <DialogContent showCloseButton={!isBulkDeleting} className="overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl dark:bg-slate-900 sm:max-w-md">
          <div className={`relative overflow-hidden px-6 pb-5 pt-7 transition-colors duration-500 ${bulkDeletePhase === "success" ? "bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900" : "bg-gradient-to-br from-red-50 via-white to-orange-50 dark:from-red-950/50 dark:via-slate-900 dark:to-orange-950/30"}`}>
            <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl transition-colors duration-500 ${bulkDeletePhase === "success" ? "bg-blue-100/60 dark:bg-blue-500/10" : "bg-red-100/60 dark:bg-red-500/10"}`} />
            <div className="relative flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-8 transition-all duration-500 ${bulkDeletePhase === "success" ? "scale-105 bg-blue-100 text-blue-600 ring-blue-50 shadow-md shadow-blue-500/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/5" : "bg-red-100 text-red-600 ring-red-50 dark:bg-red-500/15 dark:text-red-400 dark:ring-red-500/5"}`}>
                {bulkDeletePhase === "processing" ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : bulkDeletePhase === "success" ? (
                  <CheckCircle className="h-7 w-7 animate-in zoom-in-75 duration-300" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </div>
              <DialogHeader className="gap-2 pr-5 text-left">
                <DialogTitle className="text-xl text-slate-950 dark:text-white">
                  {bulkDeletePhase === "processing" ? "Menghapus payroll..." : bulkDeletePhase === "success" ? "Payroll berhasil dihapus!" : "Hapus payroll terpilih?"}
                </DialogTitle>
                <DialogDescription className="leading-6 text-slate-600 dark:text-slate-300">
                  {bulkDeletePhase === "success" ? (
                    <><strong className="font-semibold text-blue-700 dark:text-blue-300">{bulkDeleteCount} data payroll</strong> berhasil dihapus.</>
                  ) : (
                    <>Anda akan menghapus <strong className="font-semibold text-slate-900 dark:text-white">{bulkDeleteCount} data payroll</strong> sekaligus. Jurnal terkait akan dibatalkan otomatis.</>
                  )}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
          <div className="px-6 pb-2">
            <div className={`relative overflow-hidden rounded-xl border px-4 py-3 text-sm leading-5 transition-colors duration-500 ${bulkDeletePhase === "success" ? "border-blue-100 bg-blue-50/70 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300" : "border-red-100 bg-red-50/70 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"}`}>
              {bulkDeletePhase === "processing" && <div className="absolute inset-y-0 left-0 w-1/2 animate-pulse bg-gradient-to-r from-transparent via-red-200/70 to-transparent dark:via-red-400/10" />}
              <span className="relative">
                {bulkDeletePhase === "processing" ? "Membatalkan jurnal terkait dan menghapus data payroll dengan aman..." : bulkDeletePhase === "success" ? "Selesai! Modal ini akan tertutup otomatis." : "Tindakan ini permanen. Data yang sudah dihapus tidak dapat dikembalikan."}
              </span>
            </div>
          </div>
          <DialogFooter className="gap-3 px-6 pb-6 pt-3 sm:grid sm:grid-cols-2">
            <Button type="button" variant="outline" disabled={isBulkDeleting} onClick={() => setShowBulkDeleteModal(false)} className="h-11 rounded-xl border-slate-200 font-semibold dark:border-slate-700">
              Batal
            </Button>
            <Button type="button" variant={bulkDeletePhase === "success" ? "default" : "destructive"} disabled={isBulkDeleting} onClick={onBulkDelete} className={`h-11 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 ${bulkDeletePhase === "success" ? "bg-blue-600 shadow-blue-500/20 hover:bg-blue-600" : "bg-red-600 shadow-red-600/20 hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-xl"}`}>
              {bulkDeletePhase === "processing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : bulkDeletePhase === "success" ? <CheckCircle className="mr-2 h-4 w-4 animate-in zoom-in-75 duration-300" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {bulkDeletePhase === "processing" ? "Menghapus dengan aman..." : bulkDeletePhase === "success" ? "Berhasil Dihapus" : `Hapus ${bulkDeleteCount} Payroll`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormData
        isOpen={showFormModal}
        initialData={detailItem}
        onClose={() => {
          setShowFormModal(false);
          setDetailItem(undefined);
        }}
        onSuccess={() => {
          void Promise.all([fetchData(), fetchPayrollSummary()]);
        }}
      />

      {/* ─── Detail Slip Modal ─── */}
      <SlipGajiModal
        detailItem={detailItem}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setDetailItem(undefined);
        }}
        loading={loading}
      />

      <PayrollComponentConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
      />
    </>
  );
}
