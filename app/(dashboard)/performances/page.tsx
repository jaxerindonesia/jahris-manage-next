"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DynamicPage from "@/components/dynamic-page";
import { PerformanceDto } from "@/lib/dto/performance";
import { toast } from "sonner";
import FormData from "./components/form-data";
import SlipPerformanceModal from "./components/slip-performance-modal";
import { usePermission } from "@/lib/helper/check-role";
import { parseApiError } from "@/lib/helper/response-api";
import {
  columnFormats,
  headerToolbar,
  ITEMS_PER_PAGE,
  renderActions,
} from "./page.config";

const DEFAULT_FORM_DATA: PerformanceDto = {
  userId: "",
  period: "",
  productivity: 0,
  quality: 0,
  teamwork: 0,
  discipline: 0,
  notes: "",
  totalScore: 0,
  evaluatedBy: "",
};

export default function PerformancePage() {
  const { checkRole } = usePermission();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<PerformanceDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [detailItem, setDetailItem] = useState<PerformanceDto | undefined>(
    undefined,
  );
  const [printItem, setPrintItem] = useState<PerformanceDto | undefined>(undefined);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [filterScore, setFilterScore] = useState<string>("all");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
    [total],
  );

  const activeFilterCount = useMemo(
    () =>
      [filterPeriod !== "all", filterScore !== "all", searchTerm !== ""].filter(
        Boolean,
      ).length,
    [filterPeriod, filterScore, searchTerm],
  );

  const clearAllFilters = useCallback(() => {
    setFilterPeriod("all");
    setFilterScore("all");
    setSearchTerm("");
  }, []);

  const onAdd = useCallback(() => {
    setDetailItem(undefined);
    setShowModal(true);
  }, []);

  const onView = useCallback((item: PerformanceDto) => {
    setDetailItem(item);
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setDetailItem(undefined);
  }, []);

  const handleClosePrintModal = useCallback(() => {
    setShowPrintModal(false);
    setPrintItem(undefined);
    setPrintLoading(false);
  }, []);

  const fetchPerformances = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterPeriod !== "all") params.set("period", filterPeriod);
      if (filterScore !== "all") params.set("score", filterScore);

      const res = await fetch(`/api/performances?${params.toString()}`);
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data kinerja"),
        );
      }

      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengambil data kinerja",
      );
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, filterPeriod, filterScore]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/performances/${id}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          throw new Error(
            await parseApiError(res, "Gagal menghapus penilaian"),
          );
        }

        toast.success("Penilaian berhasil dihapus!");
        fetchPerformances();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Gagal menghapus penilaian",
        );
      } finally {
        setDeleteId(null);
      }
    },
    [fetchPerformances],
  );

  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true);

      const params = new URLSearchParams();
      params.set("limit", "999999");
      params.set("activeEmployeesOnly", "true");
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterPeriod !== "all") params.set("period", filterPeriod);
      if (filterScore !== "all") params.set("score", filterScore);

      const res = await fetch(`/api/performances?${params.toString()}`);
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data untuk export"),
        );
      }

      const json = await res.json();
      const allData: PerformanceDto[] = json.data || [];
      const XLSX = await import("xlsx");

      const rows = allData.map((perf) => ({
        "Nama Karyawan": perf.user?.name ?? "-",
        Periode: perf.period ?? "-",
        Produktivitas: perf.productivity,
        Kualitas: perf.quality,
        Kerjasama: perf.teamwork,
        Disiplin: perf.discipline,
        "Total Score": perf.totalScore,
        Catatan: perf.notes ?? "-",
        "Dievaluasi Oleh": perf.evaluatedBy ?? "-",
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Kinerja");

      const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
        wch:
          Math.max(
            key.length,
            ...rows.map((row) => String(row[key as keyof typeof row] ?? "").length),
          ) + 2,
      }));
      worksheet["!cols"] = colWidths;

      const fileName = `data-kinerja-${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Berhasil mengexport ${allData.length} data kinerja`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengexport data",
      );
    } finally {
      setIsExporting(false);
    }
  }, [debouncedSearchTerm, filterPeriod, filterScore]);

  const handlePrint = useCallback(async (item: PerformanceDto) => {
    if (!item.id) return;

    try {
      setShowPrintModal(true);
      setPrintLoading(true);
      const res = await fetch(`/api/performances/${item.id}`);
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil detail penilaian"),
        );
      }

      const json = await res.json();
      setPrintItem(json);
    } catch (error) {
      setShowPrintModal(false);
      toast.error(
        error instanceof Error ? error.message : "Gagal membuka slip penilaian",
      );
    } finally {
      setPrintLoading(false);
    }
  }, []);

  const toolbar = useMemo(
    () =>
      headerToolbar({
        actions: {
          onAdd,
          onExport: handleExport,
          checkRole,
          isExporting,
        },
        filters: {
          show: showFilterPanel,
          setShow: setShowFilterPanel,
          activeCount: activeFilterCount,
          clear: clearAllFilters,
          searchTerm,
          setSearchTerm,
          period: filterPeriod,
          setPeriod: setFilterPeriod,
          score: filterScore,
          setScore: setFilterScore,
        },
      }),
    [
      activeFilterCount,
      checkRole,
      clearAllFilters,
      filterPeriod,
      filterScore,
      handleExport,
      isExporting,
      onAdd,
      searchTerm,
      showFilterPanel,
    ],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filterPeriod, filterScore]);

  useEffect(() => {
    fetchPerformances();
  }, [fetchPerformances]);

  return (
    <>
      <DynamicPage<PerformanceDto>
        toolbar={toolbar}
        columns={columnFormats}
        items={data}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        loading={loading}
        emptyMessage="Tidak ada data penilaian yang ditemukan"
        bodyRowClassName="align-top"
        onPageChange={setCurrentPage}
        renderActions={(row) =>
          renderActions({
            row,
            checkRole,
            onView,
            onPrint: handlePrint,
            onDelete: handleDelete,
            deleteId,
            setDeleteId,
          })
        }
      />

      {showModal && (
        <FormData
          initialData={detailItem ?? DEFAULT_FORM_DATA}
          onClose={handleCloseModal}
          onSuccess={fetchPerformances}
        />
      )}

      <SlipPerformanceModal
        open={showPrintModal}
        detailItem={printItem}
        loading={printLoading}
        onClose={handleClosePrintModal}
      />
    </>
  );
}
