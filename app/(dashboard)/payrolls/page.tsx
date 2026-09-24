"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import DynamicPage from "@/components/dynamic-page";
import { PayrollDto } from "@/lib/dto/payroll";
import { toast } from "sonner";
import FormData from "./components/form-data";
import SlipGajiModal from "./components/slip-gaji-modal";
import PayrollComponentConfigModal from "./components/payroll-component-config-modal";
import { usePermission } from "@/lib/helper/check-role";
import { months } from "@/lib/helper/date";
import { ITEMS_PER_PAGE, columnFormats, headerToolbar, renderActions } from "./page.config";
import { CheckCircle, Clock } from "lucide-react";
import SummaryCard from "./components/summary-card";
import { ApiResponse } from "@/lib/utils";
import { parseApiError } from "@/lib/helper/response-api";
import { buildPayrollBulkPrintHtml } from "@/lib/helper/payroll-bulk-print";

export default function Page() {
  const { checkRole } = usePermission();
  const [data, setData] = useState<PayrollDto[]>([]);
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

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)), [total]);

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
    const summaryPaid = data.filter((p) => p.status === "PAID").reduce((sum, p) => sum + p.totalSalary, 0);
    const summaryPending = data.filter((p) => p.status === "PENDING").reduce((sum, p) => sum + p.totalSalary, 0);
    const summaryTotal = data.reduce((sum, p) => sum + p.totalSalary, 0);

    return [
      {
        label: "Gaji Dibayarkan",
        value: summaryPaid,
        subtitle: `Tahun ${currentYear}`,
        tone: "emerald",
        icon: CheckCircle,
      },
      {
        label: "Gaji Pending",
        value: summaryPending,
        subtitle: `Tahun ${currentYear}`,
        tone: "amber",
        icon: Clock,
      },
      {
        label: "Total Gaji",
        value: summaryTotal,
        subtitle: `Tahun ${currentYear}`,
        tone: "violet",
        icon: CheckCircle,
      },
    ];
  }, [data, currentYear]);

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
      fetchData();
    } catch (error) {
      toast.error(`Gagal menghapus gaji: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDeleteId(null);
    }
  };

  const onExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "999999");
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
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data untuk export"),
        );
      }

      const json = await res.json();
      const allData: PayrollDto[] = json.data || [];

      const XLSX = await import("xlsx");

      const rows = allData.map((emp) => ({
        "Nama Karyawan": emp.user?.name ?? "-",
        "Nomor Referensi": emp.referenceNumber ?? "-",
        Periode: `${months.find((m) => m.value === emp.month)?.label ?? emp.month} ${emp.year}`,
        "Gaji Pokok": emp.basicSalary,
        Tunjangan: emp.allowances,
        Potongan: emp.deductions,
        "Total Gaji": emp.totalSalary,
        Status: emp.status === "PAID" ? "Dibayar" : "Pending",
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Payroll");

      const fileName = `data-payroll-${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Berhasil mengexport ${allData.length} data payroll`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengexport data",
      );
    } finally {
      setIsExporting(false);
    }
  }, [debouncedFilterYear, debouncedSearchTerm, filterEndDate, filterMonth, filterPeriodMode, filterStartDate, filterStatus]);

  const onPrintAll = useCallback(async () => {
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) return toast.error("Popup PDF diblokir browser. Izinkan popup lalu coba lagi.");
    try {
      setIsExporting(true);
      printWindow.document.write("<p style='font-family:Arial;padding:24px'>Menyiapkan PDF seluruh slip payroll...</p>");
      const params = new URLSearchParams({ page: "1", limit: "999999" });
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
      const doPrint = () => { printWindow.focus(); printWindow.print(); printWindow.onafterprint = () => printWindow.close(); };
      if (printWindow.document.readyState === "complete") window.setTimeout(doPrint, 300);
      else printWindow.onload = () => window.setTimeout(doPrint, 300);
    } catch (error) {
      printWindow.close();
      toast.error(error instanceof Error ? error.message : "Gagal mencetak seluruh payroll");
    } finally {
      setIsExporting(false);
    }
  }, [debouncedFilterYear, debouncedSearchTerm, filterEndDate, filterMonth, filterPeriodMode, filterStartDate, filterStatus]);

  const toolbar = useMemo(() => {
    return headerToolbar({
      actions: {
        onAdd,
        onExport,
        onPrintAll,
        onOpenConfig: () => setShowConfigModal(true),
        checkRole,
        isExporting,
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
  }, [searchTerm, filterStatus, filterPeriodMode, filterMonth, filterYear, filterStartDate, filterEndDate, activeFilterCount, clearFilters, onAdd, onExport, onPrintAll, isExporting, checkRole, showFilterPanel]);

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
        renderActions={(row) => renderActions({ row, checkRole, onView, onViewDetail, onDelete, deleteId, setDeleteId })}
      />

      {/* ─── Create/Edit Modal ─── */}
      <FormData
        isOpen={showFormModal}
        initialData={detailItem}
        onClose={() => {
          setShowFormModal(false);
          setDetailItem(undefined);
        }}
        onSuccess={fetchData}
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
