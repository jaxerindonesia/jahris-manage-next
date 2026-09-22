"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { AttendanceDto } from "@/lib/dto/attendance";
import DetailData from "./components/detail-data";
import { usePermission } from "@/lib/helper/check-role";
import { haversineKm } from "@/lib/helper/attendance";
import { parseApiError } from "@/lib/helper/response-api";
import { getJakartaDayKey, getJakartaDayRange } from "@/lib/helper/date";
import ExportPeriodDialog from "./components/export-period-dialog";
import type { AttendanceExportPeriod } from "./types";
import type { AttendanceOvertimeDto } from "@/lib/dto/attendance-overtime";
import OvertimeConfirmationDialog from "./components/overtime-confirmation-dialog";
import { ensureFaceModelLoaded } from "@/lib/helper/face-models";
import FaceRecognitionModal from "./components/face-recognition-modal";
import { loadAndCacheFaceDescriptor } from "@/lib/helper/face-reference-cache";
import ModalAttendanceConfig from "./components/modal-attendance-config";
import DynamicPage from "@/components/dynamic-page";
import { getColumnFormats, headerToolbar, ITEMS_PER_PAGE, renderActions, STATUS_LABEL } from "./page.config";

type AttendanceConfigState = {
  officeStartTime: string;
  officeEndTime: string;
  lateToleranceMinutes: number;
  lateDeductionAmount: number;
  absentDeductionByDay: Record<string, number>;
  overtimeThresholdHours: number;
  breakEnabled: boolean;
  breakFaceCaptureEnabled: boolean;
  workingDays: string[];
  isDefault?: boolean;
  effectiveWorkSchedule?: {
    source: "REGULAR" | "SHIFT";
    startTime: string;
    endTime: string;
    shiftName: string | null;
  } | null;
};

const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfigState = {
  officeStartTime: "09:00",
  officeEndTime: "17:00",
  lateToleranceMinutes: 15,
  lateDeductionAmount: 0,
  absentDeductionByDay: {},
  overtimeThresholdHours: 2,
  breakEnabled: false,
  breakFaceCaptureEnabled: false,
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  isDefault: true,
  effectiveWorkSchedule: null,
};

const LAST_GEO_STORAGE_KEY = "hr_last_geo_point";
const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 30000,
};

type SavedGeoPoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

function getLastBreakSession(record: AttendanceDto) {
  const sessions = record.breakSessions ?? [];
  return sessions.length > 0 ? sessions[sessions.length - 1] : null;
}

export default function Page() {
  const { checkRole } = usePermission();
  const [data, setData] = useState<AttendanceDto[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<AttendanceDto | undefined>(undefined);
  const [userData, setUserData] = useState<{
    id: string;
    role: string;
    avatarUrl: string;
    faceDescriptor: number[] | null;
  }>({ id: "", role: "", avatarUrl: "", faceDescriptor: null });
  const [todayAttendance, setTodayAttendance] = useState<AttendanceDto | null>(null);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentTime, setCurrentTime] = useState("");
  const [currentDateLabel, setCurrentDateLabel] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportPeriod, setShowExportPeriod] = useState(false);
  const [overtimeSuggestion, setOvertimeSuggestion] = useState<AttendanceOvertimeDto | null>(null);

  const [showAttendanceConfig, setShowAttendanceConfig] = useState(false);
  const [attendanceConfig, setAttendanceConfig] = useState<AttendanceConfigState>(DEFAULT_ATTENDANCE_CONFIG);
  const [locationReady, setLocationReady] = useState(false);
  const [locationChecking, setLocationChecking] = useState(true);
  const [locationWarning, setLocationWarning] = useState("");
  const isIOSBrowser =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Face recognition modal state
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
  const [faceModalMode, setFaceModalMode] = useState<"check-in" | "check-out" | "break-in" | "break-out">("check-in");

  const isAdmin = ["Super Admin", "Admin"].includes(userData.role);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
    [total],
  );
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (isAdmin && searchTerm) count++;
    if (filterStatus !== "all") count++;
    return count;
  }, [filterStatus, isAdmin, searchTerm]);
  const openBreakSession = todayAttendance?.breakSessions?.find(
    (session) => session && !session.breakOut,
  );
  const hasBreakSession = (todayAttendance?.breakSessions?.length || 0) > 0;

  const refreshLocationReadiness = useCallback(async () => {
    if (typeof window === "undefined") return;
    setLocationChecking(true);
    if (!navigator.geolocation) {
      setLocationReady(false);
      setLocationChecking(false);
      setLocationWarning("Perangkat tidak mendukung akses lokasi.");
      return;
    }

    try {
      const permissionName = "geolocation" as PermissionName;
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: permissionName });
        if (perm.state === "denied") {
          setLocationReady(false);
          setLocationChecking(false);
          setLocationWarning(
            "Lokasi belum diizinkan. Aktifkan izin lokasi di browser/perangkat.",
          );
          return;
        }
        if (perm.state === "prompt") {
          setLocationReady(false);
          setLocationChecking(false);
          setLocationWarning(
            "Lokasi belum diizinkan. Klik Check In/Out untuk memberikan izin lokasi.",
          );
          return;
        }
      }

      await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          ...LOCATION_OPTIONS,
          timeout: 5000,
        }),
      );

      setLocationReady(true);
      setLocationWarning("");
    } catch (error) {
      const geoError = error as GeolocationPositionError | undefined;
      if (geoError?.code === 1) {
        setLocationReady(false);
        setLocationWarning(
          "Lokasi belum diizinkan. Aktifkan izin lokasi di browser/perangkat.",
        );
      } else if (isIOSBrowser) {
        // Safari iOS often needs user gesture before location becomes available.
        setLocationReady(true);
        setLocationWarning("");
      } else {
        setLocationReady(false);
        setLocationWarning(
          "Lokasi belum aktif. Nyalakan GPS/lokasi perangkat terlebih dahulu.",
        );
      }
    } finally {
      setLocationChecking(false);
    }
  }, [isIOSBrowser]);

  const ensureLocationAccess = useCallback(async () => {
    if (typeof window === "undefined") {
      return false;
    }

    setLocationChecking(true);

    if (!navigator.geolocation) {
      setLocationReady(false);
      setLocationWarning("Perangkat tidak mendukung akses lokasi.");
      setLocationChecking(false);
      toast.error("Perangkat ini tidak mendukung akses lokasi");
      return false;
    }

    try {
      const permissionName = "geolocation" as PermissionName;
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: permissionName });
        if (perm.state === "denied") {
          setLocationReady(false);
          setLocationWarning(
            "Akses lokasi diblokir. Izinkan lokasi di browser/perangkat lalu coba lagi.",
          );
          toast.error(
            "Akses lokasi diblokir. Izinkan lokasi di browser/perangkat lalu coba lagi.",
          );
          return false;
        }
      }

      await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          ...LOCATION_OPTIONS,
          timeout: 8000,
        }),
      );

      setLocationReady(true);
      setLocationWarning("");
      return true;
    } catch (error) {
      const geoError = error as GeolocationPositionError | undefined;
      setLocationReady(false);

      if (geoError?.code === 1) {
        setLocationWarning(
          "Lokasi belum diizinkan. Tap tombol lagi setelah mengizinkan akses lokasi.",
        );
        toast.error(
          "Lokasi belum diizinkan. Izinkan akses lokasi saat diminta, lalu coba lagi.",
        );
      } else if (isIOSBrowser) {
        setLocationReady(true);
        setLocationWarning("");
        return true;
      } else if (geoError?.code === 2) {
        setLocationWarning(
          "Lokasi belum tersedia. Pastikan GPS aktif dan tunggu beberapa saat.",
        );
        toast.error(
          "Lokasi belum tersedia. Pastikan GPS aktif dan tunggu beberapa saat.",
        );
      } else if (geoError?.code === 3) {
        setLocationWarning(
          "Permintaan lokasi terlalu lama. Pastikan sinyal GPS baik lalu coba lagi.",
        );
        toast.error(
          "Permintaan lokasi terlalu lama. Pastikan sinyal GPS baik lalu coba lagi.",
        );
      } else {
        setLocationWarning(
          "Lokasi belum aktif. Nyalakan GPS/lokasi perangkat terlebih dahulu.",
        );
        toast.error(
          "Lokasi belum aktif. Nyalakan GPS/lokasi perangkat terlebih dahulu.",
        );
      }

      return false;
    } finally {
      setLocationChecking(false);
    }
  }, [isIOSBrowser]);

  const fetchAttendanceConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance-config");
      if (!res.ok) throw new Error(await parseApiError(res, "Gagal mengambil konfigurasi kehadiran"));
      const json = await res.json();
      const config = json?.data || DEFAULT_ATTENDANCE_CONFIG;
      setAttendanceConfig({
        overtimeThresholdHours: Number(config.overtimeThresholdHours ?? 2),
        officeStartTime: config.officeStartTime || "09:00",
        officeEndTime: config.officeEndTime || "17:00",
        lateToleranceMinutes: Number(config.lateToleranceMinutes ?? 15),
        lateDeductionAmount: Number(config.lateDeductionAmount ?? 0),
        absentDeductionByDay: config.absentDeductionByDay ?? {},
        breakEnabled: Boolean(config.breakEnabled ?? false),
        breakFaceCaptureEnabled: Boolean(config.breakFaceCaptureEnabled ?? false),
        workingDays:
          Array.isArray(config.workingDays) && config.workingDays.length > 0
            ? config.workingDays
            : DEFAULT_ATTENDANCE_CONFIG.workingDays,
        isDefault: Boolean(json?.isDefault),
        effectiveWorkSchedule: json?.effectiveWorkSchedule ?? null,
      });
    } catch (error) {
      setAttendanceConfig(DEFAULT_ATTENDANCE_CONFIG);
      toast.error(error instanceof Error ? error.message : "Gagal mengambil konfigurasi kehadiran");
    }
  }, []);

  const fetchAttendance = useCallback(
    async (user: { id: string; role: string }) => {
      setLoading(true);
      try {
        if (!user?.id) return;

        if (["Super Admin", "Admin"].includes(user.role)) {
          // Server-side pagination for admin
          const params = new URLSearchParams();
          params.set("page", String(currentPage));
          params.set("limit", String(ITEMS_PER_PAGE));
          if (searchTerm) params.set("search", searchTerm);
          if (filterStatus !== "all") params.set("status", filterStatus);

          const res = await fetch(`/api/attendances?${params.toString()}`);
          if (!res.ok) throw new Error(await parseApiError(res, "Gagal mengambil data attendance"));

          const json = await res.json();
          setData(json.data || []);
          setTotal(json.total || 0);
        } else {
          // Regular users are paginated by the same page size on the server.
          const params = new URLSearchParams();
          params.set("page", String(currentPage));
          params.set("limit", String(ITEMS_PER_PAGE));
          if (filterStatus !== "all") params.set("status", filterStatus);

          const res = await fetch(`/api/attendances/user/${user.id}?${params.toString()}`);
          if (!res.ok) throw new Error(await parseApiError(res, "Gagal mengambil data attendance"));

          const json = await res.json();
          const data = json.data || [];
          setData(data);
          setTotal(json.total || 0);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal memuat data attendance");
      } finally {
        setLoading(false);
      }
    },
    [currentPage, searchTerm, filterStatus],
  );

  const fetchTodayAttendance = useCallback(async (userId: string) => {
    try {
      if (!userId) return;
      const attendanceDay = getJakartaDayKey(new Date()).toISOString();
      const params = new URLSearchParams();
      params.set("attendanceDay", attendanceDay);
      params.set("includeOpen", "true");
      params.set("limit", "1");

      const res = await fetch(`/api/attendances/user/${userId}?${params.toString()}`);
      if (!res.ok) throw new Error(await parseApiError(res, "Gagal mengambil data attendance hari ini"));

      const json = await res.json();
      setTodayAttendance(json.data?.[0] || null);
    } catch (error) {
      setTodayAttendance(null);
      toast.error(error instanceof Error ? error.message : "Gagal mengambil data attendance hari ini");
    }
  }, []);

  const handleExport = useCallback(async ({ startDate, endDate }: AttendanceExportPeriod) => {
    if (isExporting || !checkRole("attendances", "export")) return;
    if (!startDate || !endDate || startDate > endDate) {
      toast.error("Pilih rentang tanggal yang valid");
      return;
    }
    try {
      setIsExporting(true);
      const startUtc = getJakartaDayRange(new Date(`${startDate}T00:00:00+07:00`)).startUtc;
      const endUtc = getJakartaDayRange(new Date(`${endDate}T00:00:00+07:00`)).endUtc;

      let allData: AttendanceDto[] = [];

      if (["Super Admin", "Admin"].includes(userData.role)) {
        const params = new URLSearchParams();
        params.set("limit", "999999");
        params.set("startDate", startUtc.toISOString());
        params.set("endDate", endUtc.toISOString());
        if (searchTerm) params.set("search", searchTerm);
        if (filterStatus !== "all") params.set("status", filterStatus);

        const res = await fetch(`/api/attendances?${params.toString()}`);
        if (!res.ok) throw new Error(await parseApiError(res, "Gagal mengambil data untuk export"));

        const json = await res.json();
        allData = json.data || [];
      } else {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("limit", "999999");
        params.set("startDate", startUtc.toISOString());
        params.set("endDate", endUtc.toISOString());
        if (filterStatus !== "all") params.set("status", filterStatus);

        const res = await fetch(`/api/attendances/user/${userData.id}?${params.toString()}`);
        if (!res.ok) throw new Error(await parseApiError(res, "Gagal mengambil data untuk export"));

        const json = await res.json();
        allData = json.data || [];
      }

      if (allData.length === 0) {
        toast.info("Tidak ada data kehadiran untuk periode dan filter yang dipilih");
        return;
      }

      const XLSX = await import("xlsx");
      const rows: Array<Record<string, string>> = allData.map((record) => {
        const tanggal = new Date(record.date).toLocaleDateString("id-ID", {
          timeZone: "Asia/Jakarta",
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        const checkIn = record.checkIn
          ? new Date(record.checkIn).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
          })
          : "-";
        const checkOut = record.checkOut
          ? new Date(record.checkOut).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
          })
          : "-";

        const emp = ["Super Admin", "Admin"].includes(userData.role)
          ? record?.user?.name
          : "-";
        const row: Record<string, string> = {
          "Karyawan": emp!,
          Tanggal: tanggal,
          "Check In": checkIn,
          "Check Out": checkOut,
          "Break In": record.breakSessions?.[0]?.breakIn
            ? new Date(record.breakSessions[0].breakIn).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta",
              hour: "2-digit",
              minute: "2-digit",
            })
            : "-",
          "Break Out": getLastBreakSession(record)?.breakOut
            ? new Date(getLastBreakSession(record)?.breakOut as string).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta",
              hour: "2-digit",
              minute: "2-digit",
            })
            : "-",
          "Durasi Break": record.breakDuration ?? "-",
          "Jam Kerja": record.workHours ?? "-",
          Status: STATUS_LABEL[record.status] || record.status,
          Sumber: record.status === "Lembur" || record.notes?.includes("from overtime")
            ? "Lembur"
            : record.notes?.includes("approved submission")
              ? "Submission"
              : "Attendance",
          "Bukti Check In": record.checkInFaceImage ?? "-",
          "Bukti Check Out": record.checkOutFaceImage ?? "-",
        };

        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Kehadiran");

      // Auto column width
      const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
        wch:
          Math.max(
            key.length,
            ...rows.map((r) => String(r[key] ?? "").length),
          ) + 2,
      }));
      worksheet["!cols"] = colWidths;

      const fileName = `rekap-kehadiran-${startDate}_${endDate}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      setShowExportPeriod(false);

      toast.success(`Berhasil mengexport ${allData.length} data kehadiran`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengexport data");
    } finally {
      setIsExporting(false);
    }
  }, [checkRole, isExporting, filterStatus, searchTerm, userData.id, userData.role]);

  // ── Raw check-in / check-out (called after face verified) ──────────────
  const doCheckIn = useCallback(async (faceCaptureBase64: string) => {
    try {
      if (!navigator.geolocation) {
        toast.error("Perangkat ini tidak mendukung akses lokasi");
        return;
      }

      const permissionName = "geolocation" as PermissionName;
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: permissionName });
        if (perm.state === "denied") {
          toast.error(
            "Lokasi masih nonaktif. Aktifkan GPS dan izinkan akses lokasi terlebih dahulu.",
          );
          return;
        }
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, LOCATION_OPTIONS),
      );

      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        toast.error("Lokasi tidak valid. Pastikan GPS aktif lalu coba lagi.");
        return;
      }

      if (accuracy > 1500) {
        toast.error(
          "Akurasi lokasi terlalu rendah. Nyalakan GPS presisi tinggi lalu coba lagi.",
        );
        return;
      }

      const nowTs = Date.now();
      const lastRaw = localStorage.getItem(LAST_GEO_STORAGE_KEY);
      if (lastRaw) {
        try {
          const last = JSON.parse(lastRaw) as SavedGeoPoint;
          const distanceKm = haversineKm(last.lat, last.lng, latitude, longitude);
          const hours = (nowTs - last.timestamp) / 3600000;
          const speedKmh = hours > 0 ? distanceKm / hours : Number.POSITIVE_INFINITY;

          if (hours <= 2 && speedKmh > 250) {
            toast.error(
              "Lokasi terdeteksi tidak wajar (indikasi fake GPS). Nonaktifkan fake GPS lalu coba lagi.",
            );
            return;
          }
        } catch {
          // Ignore invalid local cache
        }
      }

      const res = await fetch("/api/attendances/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userData.id,
          checkInLocation: { latitude, longitude, accuracy },
          faceCaptureBase64,
        }),
      });

      if (!res.ok) {
        const message = await parseApiError(res, "Gagal melakukan check in");
        throw new Error(message);
      }

      localStorage.setItem(
        LAST_GEO_STORAGE_KEY,
        JSON.stringify({
          lat: latitude,
          lng: longitude,
          timestamp: nowTs,
        } satisfies SavedGeoPoint),
      );

      const result = await res.json();
      setTodayAttendance(result.data || null);
      toast.success("Berhasil Check In");
      fetchAttendance(userData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message || "Gagal mengambil lokasi. Nyalakan lokasi/GPS lalu izinkan akses lokasi terlebih dahulu.",
      );
    }
  }, [userData, fetchAttendance]);

  const doCheckOut = useCallback(async (faceCaptureBase64: string) => {
    try {
      if (!navigator.geolocation) {
        toast.error("Perangkat ini tidak mendukung akses lokasi");
        return;
      }

      const permissionName = "geolocation" as PermissionName;
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: permissionName });
        if (perm.state === "denied") {
          toast.error(
            "Lokasi masih nonaktif. Aktifkan GPS dan izinkan akses lokasi terlebih dahulu.",
          );
          return;
        }
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, LOCATION_OPTIONS),
      );

      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        toast.error("Lokasi tidak valid. Pastikan GPS aktif lalu coba lagi.");
        return;
      }

      if (accuracy > 1500) {
        toast.error(
          "Akurasi lokasi terlalu rendah. Nyalakan GPS presisi tinggi lalu coba lagi.",
        );
        return;
      }

      const nowTs = Date.now();
      const lastRaw = localStorage.getItem(LAST_GEO_STORAGE_KEY);
      if (lastRaw) {
        try {
          const last = JSON.parse(lastRaw) as SavedGeoPoint;
          const distanceKm = haversineKm(last.lat, last.lng, latitude, longitude);
          const hours = (nowTs - last.timestamp) / 3600000;
          const speedKmh = hours > 0 ? distanceKm / hours : Number.POSITIVE_INFINITY;

          if (hours <= 2 && speedKmh > 250) {
            toast.error(
              "Lokasi terdeteksi tidak wajar (indikasi fake GPS). Nonaktifkan fake GPS lalu coba lagi.",
            );
            return;
          }
        } catch {
          // Ignore invalid local cache
        }
      }

      const res = await fetch("/api/attendances/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userData.id,
          checkOutLocation: { latitude, longitude, accuracy },
          faceCaptureBase64,
        }),
      });
      if (!res.ok) {
        const message = await parseApiError(res, "Gagal melakukan check out");
        throw new Error(message);
      }

      localStorage.setItem(
        LAST_GEO_STORAGE_KEY,
        JSON.stringify({
          lat: latitude,
          lng: longitude,
          timestamp: nowTs,
        } satisfies SavedGeoPoint),
      );

      const result = await res.json();
      setTodayAttendance(result.data || null);
      toast.success("Berhasil Check Out");
      if (result.overtimeSuggestion) setOvertimeSuggestion(result.overtimeSuggestion);
      fetchAttendance(userData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message || "Gagal mengambil lokasi. Nyalakan lokasi/GPS lalu izinkan akses lokasi terlebih dahulu.",
      );
    }
  }, [userData, fetchAttendance]);

  const getBreakLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      throw new Error("Perangkat ini tidak mendukung akses lokasi");
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

  const doBreakCheckIn = useCallback(async (faceCaptureBase64?: string | null) => {
    try {
      const location = await getBreakLocation();
      const res = await fetch("/api/attendances/break-check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userData.id,
          breakInLocation: location,
          faceCaptureBase64,
        }),
      });

      if (!res.ok) {
        const message = await parseApiError(res, "Gagal memulai break");
        throw new Error(message);
      }

      toast.success("Break Check In berhasil");
      fetchAttendance(userData);
      fetchTodayAttendance(userData.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(message || "Gagal memulai break");
    }
  }, [userData, fetchAttendance, fetchTodayAttendance, getBreakLocation]);

  const doBreakCheckOut = useCallback(async (faceCaptureBase64?: string | null) => {
    try {
      const location = await getBreakLocation();
      const res = await fetch("/api/attendances/break-check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userData.id,
          breakOutLocation: location,
          faceCaptureBase64,
        }),
      });

      if (!res.ok) {
        const message = await parseApiError(res, "Gagal mengakhiri break");
        throw new Error(message);
      }

      toast.success("Break Check Out berhasil");
      fetchAttendance(userData);
      fetchTodayAttendance(userData.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(message || "Gagal mengakhiri break");
    }
  }, [userData, fetchAttendance, fetchTodayAttendance, getBreakLocation]);

  // ── Open face-recognition modal first ──────────────────────────────────
  const handleCheckIn = useCallback(async () => {
    const canProceed =
      locationReady || isIOSBrowser || (await ensureLocationAccess());
    if (!canProceed) return;
    setFaceModalMode("check-in");
    setIsFaceModalOpen(true);
  }, [ensureLocationAccess, isIOSBrowser, locationReady]);

  const handleCheckOut = useCallback(async () => {
    const canProceed =
      locationReady || isIOSBrowser || (await ensureLocationAccess());
    if (!canProceed) return;
    setFaceModalMode("check-out");
    setIsFaceModalOpen(true);
  }, [ensureLocationAccess, isIOSBrowser, locationReady]);

  const handleBreakCheckIn = useCallback(() => {
    if (attendanceConfig.breakFaceCaptureEnabled) {
      setFaceModalMode("break-in");
      setIsFaceModalOpen(true);
      return;
    }
    doBreakCheckIn();
  }, [attendanceConfig.breakFaceCaptureEnabled, doBreakCheckIn]);

  const handleBreakCheckOut = useCallback(() => {
    if (attendanceConfig.breakFaceCaptureEnabled) {
      setFaceModalMode("break-out");
      setIsFaceModalOpen(true);
      return;
    }
    doBreakCheckOut();
  }, [attendanceConfig.breakFaceCaptureEnabled, doBreakCheckOut]);

  const handleFaceSuccess = useCallback((captureDataUrl: string) => {
    if (!captureDataUrl) {
      toast.error("Gagal mengambil bukti foto, silakan ulangi scan wajah");
      return;
    }
    setIsFaceModalOpen(false);
    if (faceModalMode === "check-in") {
      doCheckIn(captureDataUrl);
    } else if (faceModalMode === "check-out") {
      doCheckOut(captureDataUrl);
    } else if (faceModalMode === "break-in") {
      doBreakCheckIn(captureDataUrl);
    } else {
      doBreakCheckOut(captureDataUrl);
    }
  }, [faceModalMode, doCheckIn, doCheckOut, doBreakCheckIn, doBreakCheckOut]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/attendances/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error(await parseApiError(res, "Gagal menghapus data"));

      toast.success("Data berhasil dihapus");
      fetchAttendance(userData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus data");
    } finally {
      setDeleteId(null);
    }
  };

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setFilterStatus("all");
  }, []);

  const toolbar = useMemo(
    () =>
      headerToolbar({
        actions: {
          checkRole,
          isExporting,
          onExport: () => setShowExportPeriod(true),
          onBreakCheckIn: handleBreakCheckIn,
          onBreakCheckOut: handleBreakCheckOut,
          onCheckIn: handleCheckIn,
          onCheckOut: handleCheckOut,
          onOpenConfig: () => setShowAttendanceConfig(true),
        },
        attendance: {
          attendanceConfig,
          currentDateLabel,
          currentTime,
          hasBreakSession,
          locationChecking,
          locationReady,
          locationWarning,
          openBreakSession,
          todayAttendance,
        },
        filters: {
          activeCount: activeFilterCount,
          clear: clearFilters,
          searchQuery: searchTerm,
          setSearchQuery: setSearchTerm,
          show: showFilterPanel,
          setShow: setShowFilterPanel,
          status: filterStatus,
          setStatus: setFilterStatus,
        },
        isAdmin,
      }),
    [
      activeFilterCount,
      attendanceConfig,
      checkRole,
      clearFilters,
      currentDateLabel,
      currentTime,
      filterStatus,
      handleBreakCheckIn,
      handleBreakCheckOut,
      handleCheckIn,
      handleCheckOut,
      hasBreakSession,
      isAdmin,
      isExporting,
      locationChecking,
      locationReady,
      locationWarning,
      openBreakSession,
      searchTerm,
      showFilterPanel,
      todayAttendance,
    ],
  );

  const columns = useMemo(
    () => getColumnFormats({ attendanceConfig, isAdmin }),
    [attendanceConfig, isAdmin],
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus]);

  // Fetch data when page or filters change
  useEffect(() => {
    if (!userData.id) return;

    fetchAttendance(userData);
    fetchTodayAttendance(userData.id);
    fetchAttendanceConfig();
  }, [fetchAttendance, fetchAttendanceConfig, fetchTodayAttendance, userData]);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("hr_user_data") || "{}");
    setUserData({
      id: data.id || "",
      role: data.role || "",
      avatarUrl: data.avatarUrl || data.avatar_url || "",
      faceDescriptor: Array.isArray(data.faceDescriptor) ? data.faceDescriptor : null,
    });
  }, []);

  useEffect(() => {
    if (!userData.avatarUrl || userData.faceDescriptor) return;

    const warmLegacyReference = async () => {
      try {
        await ensureFaceModelLoaded("attendance-recognition", [
          () => import("face-api.js").then((faceapi) =>
            faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          ),
          () => import("face-api.js").then((faceapi) =>
            faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          ),
          () => import("face-api.js").then((faceapi) =>
            faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
          ),
        ]);
        await loadAndCacheFaceDescriptor(userData.avatarUrl);
      } catch {
        // Modal tetap memiliki fallback dan pesan error jika pemanasan gagal.
      }
    };

    void warmLegacyReference();
  }, [userData.avatarUrl, userData.faceDescriptor]);

  useEffect(() => {
    refreshLocationReadiness();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshLocationReadiness();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshLocationReadiness]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const preload = () => {
      void ensureFaceModelLoaded("attendance-recognition", [
        () => import("face-api.js").then((faceapi) =>
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
        ),
        () => import("face-api.js").then((faceapi) =>
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        ),
        () => import("face-api.js").then((faceapi) =>
          faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ),
      ]);
    };

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(preload, { timeout: 1500 })
      : window.setTimeout(preload, 250);

    return () => {
      if (typeof idle === "number") {
        window.clearTimeout(idle);
      } else if ("cancelIdleCallback" in window) {
        window.cancelIdleCallback(idle);
      }
    };
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
      setCurrentDateLabel(
        now.toLocaleDateString("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <DynamicPage
        toolbar={toolbar}
        columns={columns}
        items={data}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        loading={loading}
        emptyMessage="Tidak ada data kehadiran untuk filter atau halaman ini"
        onPageChange={setCurrentPage}
        renderActions={(row) => renderActions({ row, checkRole, onDelete: handleDelete, onView: setDetailItem, deleteId, setDeleteId, })}
      />

      {showExportPeriod && checkRole("attendances", "export") && (
        <ExportPeriodDialog loading={isExporting} onOpenChange={setShowExportPeriod} onConfirm={handleExport} />
      )}

      {overtimeSuggestion && (
        <OvertimeConfirmationDialog suggestion={overtimeSuggestion} onClose={() => setOvertimeSuggestion(null)} />
      )}

      {detailItem && (
        <DetailData
          initialData={detailItem}
          onClose={() => setDetailItem(undefined)}
        />
      )}

      <FaceRecognitionModal
        isOpen={isFaceModalOpen}
        mode={faceModalMode}
        referenceImageUrl={userData.avatarUrl || null}
        referenceDescriptor={userData.faceDescriptor}
        onSuccess={handleFaceSuccess}
        onClose={() => setIsFaceModalOpen(false)}
      />

      {checkRole("attendances", "set-config") && (
        <ModalAttendanceConfig
          isOpen={showAttendanceConfig}
          initialConfig={attendanceConfig}
          onClose={() => {
            setShowAttendanceConfig(false);
            fetchAttendance(userData);
          }}
          onSaved={fetchAttendanceConfig}
        />
      )}
    </>
  );
}
