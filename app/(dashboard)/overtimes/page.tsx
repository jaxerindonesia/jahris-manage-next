"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import DynamicPage from "@/components/dynamic-page";
import { usePermission } from "@/lib/helper/check-role";
import type { OvertimeConfigDto, OvertimeDto } from "@/lib/dto/overtime";
import type { UserDto } from "@/lib/dto/user";
import type { ApiResponse } from "@/lib/utils";
import { parseApiError } from "@/lib/helper/response-api";
import FaceRecognitionModal from "../attendances/components/face-recognition-modal";
import ConfigModal from "./components/config-modal";
import CheckoutModal from "./components/checkout-modal";
import FormData from "./components/form-data";
import { DEFAULT_CONFIG, ITEMS_PER_PAGE, STATUS_LABEL, columnFormats, headerToolbar, renderActions } from "./page.config";
import LastApproveModal from "./components/last-approve-modal";
import RejectModal from "./components/reject-modal";
import { formatTimeId } from "@/lib/helper/date";
import ExportPeriodDialog, { type ExportPeriod } from "@/components/export-period-dialog";

const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

export default function Page() {
  const { checkRole, permissions } = usePermission();
  const [data, setData] = useState<OvertimeDto[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<OvertimeDto | undefined>(undefined);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [showExportPeriod, setShowExportPeriod] = useState(false);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [savedConfig, setSavedConfig] = useState<OvertimeConfigDto>(DEFAULT_CONFIG);
  const [draftConfig, setDraftConfig] = useState<OvertimeConfigDto>(DEFAULT_CONFIG);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [savedApproverUserIds, setSavedApproverUserIds] = useState<string[]>([]);
  const [draftApproverUserIds, setDraftApproverUserIds] = useState<string[]>([]);
  const [userId, setUserId] = useState("");
  const [userAvatarUrl, setUserAvatarUrl] = useState("");
  const [userFaceDescriptor, setUserFaceDescriptor] = useState<number[] | null>(null);
  const [currentOvertime, setCurrentOvertime] = useState<OvertimeDto | null>(null);
  const [approvingItem, setApprovingItem] = useState<OvertimeDto | null>(null);
  const [approvePayMethod, setApprovePayMethod] = useState<"PER_HOUR" | "PER_DAY">("PER_HOUR");
  const [pendingCheckAction, setPendingCheckAction] = useState<{
    overtimeId: string;
    type: "check-in" | "check-out";
    proofFile?: File | null;
  } | null>(null);
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
  const [faceModalMode, setFaceModalMode] = useState<"check-in" | "check-out">("check-in");
  const [checkoutItem, setCheckoutItem] = useState<OvertimeDto | undefined>(undefined);
  const [checkingAction, setCheckingAction] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)), [total]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (filterStatus !== "all") count++;
    if (filterStartDate) count++;
    if (filterEndDate) count++;
    return count;
  }, [searchTerm, filterStatus, filterStartDate, filterEndDate]);
  const hasOvertimeConfigPermission = useMemo(
    () =>
      permissions.some(
        (permission) =>
          permission.model === "overtimes" && permission.action === "set-config",
      ),
    [permissions],
  );

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setFilterStatus("all");
    setFilterStartDate("");
    setFilterEndDate("");
  }, []);

  const onAdd = useCallback(() => {
    setDetailItem(undefined);
    setShowFormModal(true);
  }, []);

  const getCurrentPosition = useCallback(async () => {
    if (!navigator.geolocation) {
      throw new Error("Perangkat ini tidak mendukung akses lokasi");
    }

    const permissionName = "geolocation" as PermissionName;
    if (navigator.permissions?.query) {
      const perm = await navigator.permissions.query({ name: permissionName });
      if (perm.state === "denied") {
        throw new Error("Lokasi masih nonaktif. Aktifkan GPS dan izinkan akses lokasi terlebih dahulu.");
      }
    }

    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, LOCATION_OPTIONS),
    );
    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Lokasi tidak valid. Pastikan GPS aktif lalu coba lagi.");
    }
    if (accuracy > 1500) {
      throw new Error("Akurasi lokasi terlalu rendah. Nyalakan GPS presisi tinggi lalu coba lagi.");
    }

    return { latitude, longitude, accuracy };
  }, []);

  const onExport = useCallback(async ({ startDate, endDate }: ExportPeriod) => {
    if (!startDate || !endDate || startDate > endDate) {
      toast.error("Pilih rentang tanggal yang valid");
      return;
    }
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ limit: "999999", activeEmployeesOnly: "true" });
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterStatus !== "all") params.set("status", filterStatus);
      params.set("startDate", startDate);
      params.set("endDate", endDate);

      const response = await fetch(`/api/overtimes?${params.toString()}`);
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengambil data untuk export"));

      const json: ApiResponse = await response.json();
      const allData: OvertimeDto[] = json.data || [];
      const XLSX = await import("xlsx");

      const rows = allData.map((item) => ({
        Karyawan: item.user?.name ?? "-",
        Tanggal: item.overtimeDate ? new Date(item.overtimeDate).toLocaleDateString("id-ID") : "-",
        "Check In": item.startTime ? formatTimeId(item.startTime) : "-",
        "Check Out": item.endTime ? formatTimeId(item.endTime) : "-",
        Durasi: item.overtimeMinutes ? `${Math.floor((item.overtimeMinutes || 0) / 60)} jam` : "-",
        Nominal: item.payoutAmount || 0,
        Status: STATUS_LABEL[item.status] || item.status || "-",
        Keterangan: item.description || "-",
        "Bukti Lembur": item.proofUrl || "-",
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Overtime");
      XLSX.writeFile(workbook, `data-overtime-${startDate}_${endDate}.xlsx`);
      setShowExportPeriod(false);
      toast.success(`Berhasil mengexport ${rows.length} data overtime`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengexport data");
    } finally {
      setIsExporting(false);
    }
  }, [debouncedSearchTerm, filterStatus]);

  const onView = async (id: string) => {
    await fetchDetail(id);
    setShowFormModal(true);
  };

  const handleCheckIn = useCallback((id: string) => {
    setPendingCheckAction({ overtimeId: id, type: "check-in" });
    setFaceModalMode("check-in");
    setIsFaceModalOpen(true);
  }, []);

  const handleCheckOut = useCallback((id: string) => {
    const item = data.find((row) => row.id === id);
    setCheckoutItem(item);
    setPendingCheckAction({ overtimeId: id, type: "check-out", proofFile: null });
    setShowCheckoutModal(true);
  }, [data]);

  const submitCheckout = useCallback((file: File | null) => {
    if (!pendingCheckAction?.overtimeId) return;
    setPendingCheckAction((current) =>
      current ? { ...current, type: "check-out", proofFile: file } : current,
    );
    setShowCheckoutModal(false);
    setFaceModalMode("check-out");
    setIsFaceModalOpen(true);
  }, [pendingCheckAction]);

  const toolbar = useMemo(
    () =>
      headerToolbar({
        actions: {
          onAdd,
          onExport: () => setShowExportPeriod(true),
          onCheckIn: currentOvertime?.id ? () => handleCheckIn(currentOvertime.id!) : undefined,
          onCheckOut: currentOvertime?.id ? () => handleCheckOut(currentOvertime.id!) : undefined,
          onOpenConfig: () => {
            setDraftConfig(savedConfig);
            setDraftApproverUserIds(savedApproverUserIds);
            setShowConfigModal(true);
          },
          checkRole,
          isExporting,
        },
        overtime: {
          currentOvertime,
        },
        filters: {
          show: showFilterPanel,
          setShow: setShowFilterPanel,
          activeCount: activeFilterCount,
          clear: clearFilters,
          searchTerm,
          setSearchTerm,
          status: filterStatus,
          setStatus: setFilterStatus,
          startDate: filterStartDate,
          setStartDate: setFilterStartDate,
          endDate: filterEndDate,
          setEndDate: setFilterEndDate,
        },
      }),
    [activeFilterCount, checkRole, clearFilters, currentOvertime, filterEndDate, filterStartDate, filterStatus, handleCheckIn, handleCheckOut, isExporting, onAdd, savedApproverUserIds, savedConfig, searchTerm, showFilterPanel],
  );

  const onDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/overtimes/${id}`, { method: "DELETE" });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal menghapus overtime");

      toast.success("Overtime berhasil dihapus!");
      fetchData();
    } catch (error) {
      toast.error(`Gagal menghapus overtime: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDeleteId(null);
    }
  };

  const onApprove = async (id: string, payMethod?: "PER_HOUR" | "PER_DAY") => {
    try {
      const response = await fetch(`/api/overtimes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalAction: "APPROVE",
          ...(payMethod ? { payMethod } : {}),
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Gagal menyetujui overtime");

      toast.success("Overtime disetujui");
      setShowApproveModal(false);
      setApprovingItem(null);
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyetujui overtime");
    }
  };

  const onReasonReject = () => {
    setShowRejectModal(true);
    setRejectReason("");
  };

  const onReject = async (id: string) => {
    try {
      const response = await fetch(`/api/overtimes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalAction: "REJECT",
          rejectionReason: rejectReason,
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Gagal menolak overtime");

      toast.success("Overtime ditolak");
      setShowRejectModal(false);
      setRejectId("");
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menolak overtime");
    }
  };

  const handleAddApprover = (userId: string) => {
    if (!userId) return;
    setDraftApproverUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
  };

  const handleRemoveApprover = (userId: string) => {
    setDraftApproverUserIds((current) => current.filter((id) => id !== userId));
  };

  const handleSaveConfig = async () => {
    try {
      const response = await fetch("/api/overtime-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hourlyRate: draftConfig.hourlyRate,
          dailyRate: draftConfig.dailyRate,
          approverUserIds: draftApproverUserIds,
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Gagal menyimpan konfigurasi lembur");

      const nextConfig = json.data || DEFAULT_CONFIG;
      const nextApproverUserIds = (nextConfig.approverConfigs || []).map(
        (item: NonNullable<OvertimeConfigDto["approverConfigs"]>[number]) => item.approverUserId,
      );
      setSavedConfig(nextConfig);
      setDraftConfig(nextConfig);
      setSavedApproverUserIds(nextApproverUserIds);
      setDraftApproverUserIds(nextApproverUserIds);

      toast.success("Konfigurasi lembur berhasil disimpan");
      setShowConfigModal(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan konfigurasi lembur");
    }
  };

  const handleApproveClick = (item: OvertimeDto) => {
    if (!item.id) return;
    if (isFinalApproval(item)) {
      setApprovingItem(item);
      setApprovePayMethod("PER_HOUR");
      setShowApproveModal(true);
    } else {
      onApprove(item.id);
    }
  };

  const isFinalApproval = useCallback(
    (item: OvertimeDto) => {
      const decisions = item.approvalDecisions || [];
      const currentDecision = decisions.find(
        (decision) => decision.approverUserId === userId,
      );

      return (
        currentDecision?.status === "PENDING" &&
        decisions.filter((decision) => decision.status === "PENDING").length === 1 &&
        decisions.every(
          (decision) =>
            decision.approverUserId === userId || decision.status === "APPROVED",
        )
      );
    },
    [userId],
  );

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/overtime-config");
      if (!response.ok) {
        throw new Error(
          await parseApiError(response, "Gagal memuat konfigurasi overtime"),
        );
      }
      const json = await response.json();
      const nextConfig = json.data || DEFAULT_CONFIG;
      const nextApproverUserIds = (nextConfig.approverConfigs || []).map(
        (item: NonNullable<OvertimeConfigDto["approverConfigs"]>[number]) => item.approverUserId,
      );
      setSavedConfig(nextConfig);
      setDraftConfig(nextConfig);
      setSavedApproverUserIds(nextApproverUserIds);
      setDraftApproverUserIds(nextApproverUserIds);
    } catch (error) {
      setSavedConfig(DEFAULT_CONFIG);
      setDraftConfig(DEFAULT_CONFIG);
      setSavedApproverUserIds([]);
      setDraftApproverUserIds([]);
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal memuat konfigurasi lembur",
      );
    }
  }, []);

  const fetchApproverUsers = useCallback(async () => {
    try {
      const response = await fetch("/api/users?limit=9999");
      if (!response.ok) {
        throw new Error(
          await parseApiError(response, "Gagal memuat data approver"),
        );
      }
      const json = await response.json();
      const userItems: UserDto[] = json.data || [];
      setUsers(userItems.filter((user) => {
        const roleName = user.role?.name?.trim().toLowerCase();
        return Boolean(roleName) && roleName !== "karyawan";
      }));
    } catch (error) {
      setUsers([]);
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat data approver",
      );
    }
  }, []);


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);

      const response = await fetch(`/api/overtimes?${params.toString()}`);
      const json: ApiResponse = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error((json as { message?: string }).message || "Failed to load overtimes");
      }

      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat data lembur",
      );
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, filterEndDate, filterStartDate, filterStatus]);

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/overtimes/${id}`);
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Gagal memuat detail lembur"));
      }
      const json = await response.json();
      setDetailItem(json.data || undefined);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat detail lembur",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCurrentOvertime = useCallback(async (currentUserId: string) => {
    try {
      if (!currentUserId) {
        setCurrentOvertime(null);
        return;
      }

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const params = new URLSearchParams();
      params.set("limit", "1");
      params.set("activeOnly", "true");
      params.set("overtimeDate", today);

      const response = await fetch(`/api/overtimes?${params.toString()}`);
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Gagal memuat status lembur hari ini"));
      }

      const json = await response.json();
      const items: OvertimeDto[] = json.data || [];
      const currentItem = items.find((item) => item.userId === currentUserId) || null;
      setCurrentOvertime(currentItem);
    } catch (error) {
      setCurrentOvertime(null);
      toast.error(error instanceof Error ? error.message : "Gagal memuat status lembur hari ini");
    }
  }, []);

  const handleOvertimeFormSuccess = useCallback(async () => {
    await fetchData();
    if (userId) {
      await fetchCurrentOvertime(userId);
    }
  }, [fetchCurrentOvertime, fetchData, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (permissions.length === 0) return;

    if (hasOvertimeConfigPermission) {
      fetchConfig();
    }

    fetchApproverUsers();
  }, [fetchApproverUsers, fetchConfig, hasOvertimeConfigPermission, permissions.length]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filterStatus]);

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("hr_user_data") || "{}");
    setUserId(userData.id || "");
    setUserAvatarUrl(userData.avatarUrl || userData.avatar_url || "");
    setUserFaceDescriptor(
      Array.isArray(userData.faceDescriptor) ? userData.faceDescriptor : null,
    );
    if (userData.id) {
      fetchCurrentOvertime(userData.id);
    }
  }, [fetchCurrentOvertime]);

  const handleFaceModalSuccess = useCallback(async (captureDataUrl: string) => {
    if (!pendingCheckAction) return;

    setCheckingAction(true);
    try {
      const location = await getCurrentPosition();

      if (pendingCheckAction.type === "check-in") {
        const response = await fetch("/api/overtimes/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            overtimeId: pendingCheckAction.overtimeId,
            userId,
            faceCaptureBase64: captureDataUrl,
            checkInLocation: location,
          }),
        });

        if (!response.ok) {
          throw new Error(await parseApiError(response, "Gagal check in lembur"));
        }

        toast.success("Check in lembur berhasil");
      } else {
        const fd = new globalThis.FormData();
        fd.append("overtimeId", pendingCheckAction.overtimeId);
        fd.append("userId", userId);
        fd.append("faceCaptureBase64", captureDataUrl);
        fd.append("checkOutLocation", JSON.stringify(location));
        if (pendingCheckAction.proofFile) {
          fd.append("file", pendingCheckAction.proofFile);
        }

        const response = await fetch("/api/overtimes/check-out", {
          method: "POST",
          body: fd,
        });

        if (!response.ok) {
          throw new Error(await parseApiError(response, "Gagal check out lembur"));
        }

        toast.success("Check out lembur berhasil");
      }

      setIsFaceModalOpen(false);
      setPendingCheckAction(null);
      setCheckoutItem(undefined);
      fetchData();
      fetchCurrentOvertime(userId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memproses lembur");
    } finally {
      setCheckingAction(false);
    }
  }, [fetchCurrentOvertime, fetchData, getCurrentPosition, pendingCheckAction, userId]);

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
        emptyMessage="Belum ada data lembur"
        onPageChange={setCurrentPage}
        renderActions={(row) =>
          renderActions({
            row,
            checkRole,
            onView,
            onDelete,
            onApprove: () => handleApproveClick(row),
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
        onSuccess={handleOvertimeFormSuccess}
      />

      {showExportPeriod && checkRole("overtimes", "export") && (
        <ExportPeriodDialog
          loading={isExporting}
          onOpenChange={setShowExportPeriod}
          onConfirm={onExport}
          title="Download Data Lembur"
          description="Pilih rentang tanggal lembur yang akan dimasukkan ke file Excel. Filter pencarian dan status yang aktif tetap diterapkan."
          idPrefix="overtime-export"
        />
      )}

      <CheckoutModal
        isOpen={showCheckoutModal}
        overtime={checkoutItem}
        loading={checkingAction}
        onClose={() => {
          setShowCheckoutModal(false);
          setCheckoutItem(undefined);
          setPendingCheckAction(null);
        }}
        onSubmit={submitCheckout}
      />

      <ConfigModal
        open={showConfigModal}
        users={users.map((user) => ({
          id: user.id ?? "",
          name: user.name,
          email: user.email,
        }))}
        approverUserIds={draftApproverUserIds}
        config={draftConfig}
        onAddApprover={handleAddApprover}
        onClose={() => {
          setDraftConfig(savedConfig);
          setDraftApproverUserIds(savedApproverUserIds);
          setShowConfigModal(false);
        }}
        onDailyRateChange={(value) => setDraftConfig((current) => ({ ...current, dailyRate: value }))}
        onHourlyRateChange={(value) => setDraftConfig((current) => ({ ...current, hourlyRate: value }))}
        onRemoveApprover={handleRemoveApprover}
        onSave={handleSaveConfig}
      />

      <RejectModal
        isOpen={showRejectModal}
        rejectReason={rejectReason}
        onClose={() => setShowRejectModal(false)}
        onConfirm={() => rejectId && onReject(rejectId)}
        onOpenChange={setShowRejectModal}
        onRejectReasonChange={setRejectReason}
      />

      <LastApproveModal
        isOpen={showApproveModal}
        approvePayMethod={approvePayMethod}
        config={savedConfig}
        onClose={() => {
          setShowApproveModal(false);
          setApprovingItem(null);
        }}
        onApprove={() => approvingItem?.id && onApprove(approvingItem.id, approvePayMethod)}
        onApprovePayMethodChange={setApprovePayMethod}
      />

      <FaceRecognitionModal
        isOpen={isFaceModalOpen}
        mode={faceModalMode}
        referenceImageUrl={userAvatarUrl || null}
        referenceDescriptor={userFaceDescriptor}
        onSuccess={handleFaceModalSuccess}
        onClose={() => {
          setIsFaceModalOpen(false);
          setCheckingAction(false);
          setPendingCheckAction(null);
        }}
      />
    </>
  );
}
