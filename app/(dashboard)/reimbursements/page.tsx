"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "@/lib/helper/check-role";
import { ReimbursementDto } from "@/lib/dto/reimbursement";
import ReimbursementFormData from "./components/form-data";
import SlipReimbursementModal from "./components/slip-reimbursement-modal";
import { ApiResponse } from "@/lib/utils";
import { columnFormats, headerToolbar, ITEMS_PER_PAGE, renderActions, STATUS_LABEL } from "./page.config";
import DynamicPage from "@/components/dynamic-page";
import SummaryCard from "./components/summary-card";
import { parseApiError } from "@/lib/helper/response-api";
import { getReimbursementDetails, getReceiptUrls } from "@/lib/helper/reimbursement";
import { formatDateId } from "@/lib/helper/date";

export default function Page() {
  const { checkRole } = usePermission();
  const [data, setData] = useState<ReimbursementDto[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<ReimbursementDto | undefined>(undefined);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isExporting, setIsExporting] = useState(false);

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)), [total]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (filterCategory !== "all") count++;
    if (filterStatus !== "all") count++;
    return count;
  }, [searchTerm, filterCategory, filterStatus]);

  const summaryCards = useMemo(() => {
    const approvedTotal = data
      .filter((item) => item.status === "APPROVED")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const rejectedTotal = data
      .filter((item) => item.status === "REJECTED")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pendingTotal = data
      .filter((item) => item.status === "PENDING")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const allTotal = data.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return [
      {
        label: "Reimbursement Disetujui",
        value: approvedTotal,
        subtitle: `Tahun ${new Date().getFullYear()}`,
        tone: "emerald",
        icon: CheckCircle,
      },
      {
        label: "Reimbursement Ditolak",
        value: rejectedTotal,
        subtitle: `Tahun ${new Date().getFullYear()}`,
        tone: "rose",
        icon: XCircle,
      },
      {
        label: "Reimbursement Pending",
        value: pendingTotal,
        subtitle: `Tahun ${new Date().getFullYear()}`,
        tone: "amber",
        icon: Clock,
      },
      {
        label: "Total Reimbursement",
        value: allTotal,
        subtitle: `Tahun ${new Date().getFullYear()}`,
        tone: "violet",
        icon: CheckCircle,
      },
    ];
  }, [data]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setFilterCategory("all");
    setFilterStatus("all");
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

  const onApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/reimbursements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "APPROVED",
          approvedAt: new Date(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal menyetujui reimbursement");
      toast.success("Reimbursement berhasil disetujui!");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menyetujui reimbursement");
    }
  };

  const onReject = async (id: string) => {
    try {
      const res = await fetch(`/api/reimbursements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "REJECTED",
          approvedAt: new Date(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal menolak reimbursement");
      toast.success("Reimbursement berhasil ditolak!");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menolak reimbursement");
    }
  };

  const onDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/reimbursements/${id}`, { method: "DELETE" });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal menghapus reimbursement");

      toast.success("Reimbursement berhasil dihapus!");
      fetchData();
    } catch (error) {
      toast.error(`Gagal menghapus reimbursement: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDeleteId(null);
    }
  };

  const onExport = useCallback(async () => {
    try {
      setIsExporting(true);

      const params = new URLSearchParams();
      params.set("limit", "999999");
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (filterStatus !== "all") params.set("status", filterStatus);

      const res = await fetch(`/api/reimbursements?${params.toString()}`);
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data untuk export"),
        );
      }

      const json = await res.json();
      const allData: ReimbursementDto[] = json.data || [];

      const XLSX = await import("xlsx");

      const rows = allData.map((r) => ({
        "Nama Karyawan": r.user?.name ?? "-",
        "Judul Klaim": r.title ?? "-",
        Kategori: r.category ?? "-",
        "Bank Tujuan": r.bankName ?? "-",
        "No. Rekening": r.accountNumber ?? "-",
        Tanggal: r.date
          ? new Date(r.date).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
          : "-",
        Nominal: r.amount,
        Status: STATUS_LABEL[r.status] ?? r.status,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Reimbursement");

      const detailRows = allData.flatMap((claim) => getReimbursementDetails(claim).map((detail, index) => ({
        "Nomor Referensi": claim.referenceNumber || claim.id,
        "Nama Karyawan": claim.user?.name || "-",
        "Judul Klaim": claim.title,
        "Rincian": index + 1,
        "Kategori": detail.category,
        "Tanggal Pengeluaran": formatDateId(detail.date),
        "Nominal": detail.amount,
        "Bukti": getReceiptUrls(detail).join("\n") || "-",
      })));
      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      detailSheet["!cols"] = [{ wch: 24 }, { wch: 24 }, { wch: 36 }, { wch: 10 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 45 }];
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Rincian Pengeluaran");

      // Auto column width
      type Row = (typeof rows)[number];
      const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
        wch:
          Math.max(
            key.length,
            ...rows.map((r) => String(r[key as keyof Row] ?? "").length),
          ) + 2,
      }));
      worksheet["!cols"] = colWidths;

      // Format Nominal column as currency
      const nominalColIndex = Object.keys(rows[0] ?? {}).indexOf("Nominal");
      if (nominalColIndex >= 0) {
        const colLetter = XLSX.utils.encode_col(nominalColIndex);
        for (let i = 2; i <= rows.length + 1; i++) {
          const cellRef = `${colLetter}${i}`;
          if (worksheet[cellRef]) {
            worksheet[cellRef].z = "#,##0";
          }
        }
      }

      const fileName = `data-reimbursement-${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Berhasil mengexport ${allData.length} data reimbursement`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengexport data",
      );
    } finally {
      setIsExporting(false);
    }
  }, [debouncedSearchTerm, filterCategory, filterStatus]);

  const toolbar = useMemo(() => {
    return headerToolbar({
      actions: {
        onAdd,
        onExport,
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
        category: filterCategory,
        setCategory: setFilterCategory,
        status: filterStatus,
        setStatus: setFilterStatus,
      },
    })
  }, [searchTerm, filterCategory, filterStatus, activeFilterCount, clearFilters, onAdd, onExport, isExporting, checkRole, showFilterPanel]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (filterStatus !== "all") params.set("status", filterStatus);

      const res = await fetch(`/api/reimbursements?${params.toString()}`);
      const json: ApiResponse = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          (json as { message?: string })?.message ||
            "Gagal memuat data reimbursement",
        );
      }

      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal memuat data reimbursement",
      );
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, filterCategory, filterStatus]);

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reimbursements/${id}`);
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal memuat detail reimbursement"),
        );
      }
      const json = await res.json();
      setDetailItem(json.data || undefined);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal memuat detail reimbursement",
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
    setCurrentPage(1);
  }, [debouncedSearchTerm, filterCategory, filterStatus]);

  return (
    <>
      {/* Card History Reimbursement */}
      <div className="grid gap-4 md:grid-cols-4 mb-4">
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
        emptyMessage="Belum ada pengajuan reimbursement"
        onPageChange={setCurrentPage}
        renderActions={(row) => renderActions({ row, checkRole, onView, onViewDetail, onApprove, onReject, onDelete, deleteId, setDeleteId })}
      />

      {/* ─── Create/Edit Modal ─── */}
      <ReimbursementFormData
        isOpen={showFormModal}
        initialData={detailItem}
        onClose={() => setShowFormModal(false)}
        onSuccess={fetchData}
      />

      {/* ─── Detail Slip Modal ─── */}
      <SlipReimbursementModal
        open={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setDetailItem(undefined);
        }}
        detailItem={detailItem}
        loading={loading}
      />
    </>
  );
}
