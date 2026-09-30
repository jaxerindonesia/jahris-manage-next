"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import DynamicPage from "@/components/dynamic-page";
import { usePermission } from "@/lib/helper/check-role";
import type { SubmissionDto } from "@/lib/dto/submission";
import type { SubmissionTypeDto } from "@/lib/dto/submission-type";
import type { ApiResponse } from "@/lib/utils";
import { parseApiError } from "@/lib/helper/response-api";
import FormData from "./components/form-data";
import { columnFormats, headerToolbar, ITEMS_PER_PAGE, renderActions, STATUS_LABEL } from "./page.config";
import TypeModal from "./components/type-modal";
import LeaveConfigModal from "./components/leave-config-modal";
import RejectModal from "./components/reject-modal";

export default function Page() {
  const { checkRole } = usePermission();
  const [data, setData] = useState<SubmissionDto[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<SubmissionDto | undefined>(undefined);
  const [submissionTypes, setSubmissionTypes] = useState<SubmissionTypeDto[]>([]);

  const [isExporting, setIsExporting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFormModal, setShowFormModal] = useState(false);
  const [showLeaveConfigModal, setShowLeaveConfigModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)), [total]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (filterType !== "all") count++;
    if (filterStatus !== "all") count++;
    return count;
  }, [filterStatus, filterType, searchTerm]);

  const clearFilters = useCallback(() => {
    setFilterType("all");
    setFilterStatus("all");
    setSearchTerm("");
  }, []);

  const onAdd = () => {
    setDetailItem(undefined);
    setShowFormModal(true);
  };

  const onView = async (id: string) => {
    await fetchDetail(id);
    setShowFormModal(true);
  };

  const onDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/submissions/${id}`, { method: "DELETE" });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal menghapus pengajuan");

      toast.success("Pengajuan berhasil dihapus!");
      fetchData();
    } catch (error) {
      toast.error(`Gagal menghapus pengajuan: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDeleteId(null);
    }
  };

  const onApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/submissions/${id}`, {
        method: "PUT",
        body: JSON.stringify({ approvalAction: "APPROVE" }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal menyetujui pengajuan");

      toast.success("Pengajuan berhasil disetujui!");
      fetchData();
    } catch (error) {
      toast.error(`Gagal menyetujui pengajuan: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const onReasonReject = () => {
    setShowRejectModal(true);
    setRejectReason("");
  }

  const onReject = async (id: string) => {
    try {
      const response = await fetch(`/api/submissions/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          approvalAction: "REJECT",
          rejectionReason: rejectReason,
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Gagal menolak pengajuan");

      toast.success("Pengajuan berhasil ditolak!");
      setShowRejectModal(false);
      setRejectId("");
      fetchData();
    } catch (error) {
      toast.error(`Gagal menolak pengajuan: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const onExport = useCallback(async () => {
    try {
      setIsExporting(true);

      const params = new URLSearchParams();
      params.set("limit", "999999");
      params.set("activeEmployeesOnly", "true");
      if (searchTerm) params.set("search", searchTerm);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterType !== "all") params.set("submissionTypeId", filterType);

      const response = await fetch(`/api/submissions?${params.toString()}`);
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengambil data untuk export"));

      const json = await response.json();
      const allData: SubmissionDto[] = json.data || [];
      const XLSX = await import("xlsx");

      const rows = allData.map((submission) => ({
        "Nama Karyawan": submission.user?.name ?? "-",
        "Jenis Pengajuan": submission.submissionType?.name ?? "-",
        "Tanggal Mulai": submission.startDate
          ? new Date(submission.startDate).toLocaleDateString("id-ID", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })
          : "-",
        "Tanggal Selesai": submission.endDate
          ? new Date(submission.endDate).toLocaleDateString("id-ID", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })
          : "-",
        Alasan: submission.reason || "-",
        Status: STATUS_LABEL[submission.status] ?? submission.status,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Pengajuan");

      type Row = (typeof rows)[number];
      worksheet["!cols"] = Object.keys(rows[0] ?? {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((row) => String(row[key as keyof Row] ?? "").length)) + 2,
      }));

      XLSX.writeFile(workbook, `data-pengajuan-${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success(`Berhasil mengexport ${allData.length} data pengajuan`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengexport data");
    } finally {
      setIsExporting(false);
    }
  }, [filterStatus, filterType, searchTerm]);

  const fetchSubmissionTypes = useCallback(async () => {
    try {
      const response = await fetch("/api/submission-types");
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengambil data jenis pengajuan"));
      const json = await response.json();
      setSubmissionTypes(json.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat data jenis pengajuan");
    }
  }, []);

  const toolbar = useMemo(
    () =>
      headerToolbar({
        actions: {
          checkRole,
          isExporting,
          onAdd,
          onExport,
          onOpenLeaveConfig: () => setShowLeaveConfigModal(true),
          onOpenTypeModal: () => setShowTypeModal(true),
        },
        filters: {
          activeCount: activeFilterCount,
          clear: clearFilters,
          searchTerm,
          setSearchTerm,
          show: showFilterPanel,
          setShow: setShowFilterPanel,
          status: filterStatus,
          setStatus: setFilterStatus,
          type: filterType,
          setType: setFilterType,
          submissionTypes,
        },
      }),
    [
      activeFilterCount,
      checkRole,
      clearFilters,
      filterStatus,
      filterType,
      isExporting,
      onExport,
      searchTerm,
      showFilterPanel,
      submissionTypes,
    ],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (searchTerm) params.set("search", searchTerm);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterType !== "all") params.set("submissionTypeId", filterType);

      const response = await fetch(`/api/submissions?${params.toString()}`);
      const json: ApiResponse = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error((json as { message?: string }).message || "Gagal mengambil data pengajuan");
      }

      setData((json.data as SubmissionDto[]) ?? []);
      setTotal(json.total ?? 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat data pengajuan");
    } finally {
      setLoading(false);
    }
  }, [currentPage, filterStatus, filterType, searchTerm]);

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/submissions/${id}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setDetailItem(json.data || undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat detail data pengajuan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchSubmissionTypes();
  }, [fetchSubmissionTypes]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterType, searchTerm]);

  return (
    <>
      <DynamicPage
        toolbar={toolbar}
        columns={columnFormats}
        items={data}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        loading={loading}
        emptyMessage="Tidak ada data pengajuan yang ditemukan"
        onPageChange={setCurrentPage}
        renderActions={(row) =>
          renderActions({
            row,
            checkRole,
            onApprove,
            onDelete,
            onView,
            onReasonReject,
            setRejectId,
            deleteId,
            setDeleteId,
          })
        }
      />

      <FormData
        isOpen={showFormModal}
        initialData={detailItem}
        onClose={() => setShowFormModal(false)}
        onSuccess={fetchData}
      />

      {checkRole("submission_types", "create") && (
        <>
          <TypeModal
            isOpen={showTypeModal}
            onClose={() => setShowTypeModal(false)}
          />

          <LeaveConfigModal
            isOpen={showLeaveConfigModal}
            onClose={() => setShowLeaveConfigModal(false)}
          />
        </>
      )}

      <RejectModal
        isOpen={showRejectModal}
        rejectReason={rejectReason}
        onClose={() => setShowRejectModal(false)}
        onConfirm={() => rejectId && onReject(rejectId)}
        onOpenChange={setShowRejectModal}
        onRejectReasonChange={setRejectReason}
      />
    </>
  );
}
