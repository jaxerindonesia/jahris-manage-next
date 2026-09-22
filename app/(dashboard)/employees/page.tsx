"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { UserDto } from "@/lib/dto/user";
import { toast } from "sonner";
import FormData from "./components/form-data";
import { usePermission } from "@/lib/helper/check-role";
import { DepartmentDto } from "@/lib/dto/department";
import type { BranchDto } from "@/lib/dto/branch";
import DynamicPage from "@/components/dynamic-page";
import { formatDateId } from "@/lib/helper/date";
import { parseApiError } from "@/lib/helper/response-api";
import type { EmployeeRecapDto } from "@/lib/dto/employee-recap";
import {
  buildEmployeeRecapPrintHtml,
  waitForEmployeeRecapImages,
} from "@/lib/helper/employee-recap-print";
import {
  columnFormats,
  type DepartmentOption,
  headerToolbar,
  ITEMS_PER_PAGE,
  renderActions,
  TenantOption,
} from "./page.config";
import DepartmentModal from "./components/department-modal";
import ImportModal from "./components/import-modal";
import RecapModal from "./components/recap-modal";
import BulkRecapPeriodDialog from "./components/bulk-recap-period-dialog";

export default function EmployeesPage() {
  const { checkRole, permissions } = usePermission();
  const [userData, setUserData] = useState({ id: "", role: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [recapEmployee, setRecapEmployee] = useState<UserDto | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<UserDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<UserDto | undefined>(undefined);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [showBulkRecapPeriod, setShowBulkRecapPeriod] = useState(false);

  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
    [total],
  );
  const isSuperAdmin = userData.role === "Super Admin";
  const isAdmin = userData.role === "Admin";
  const canFetchDepartments = useMemo(
    () => permissions.some(
      (permission) =>
        permission.model === "departments" && permission.action === "get-all",
    ),
    [permissions],
  );
  const canFetchBranches = useMemo(
    () => permissions.some(
      (permission) => permission.model === "branches" && permission.action === "get-all",
    ),
    [permissions],
  );

  const getDepartmentDisplayName = useCallback(
    (dept?: DepartmentOption) => {
      if (!dept) return "-";
      if (!isSuperAdmin) return dept.name || "-";
      const companyName = dept.tenant?.companyName || "";
      return companyName ? `${dept.name} - ${companyName}` : dept.name || "-";
    },
    [isSuperAdmin],
  );

  const activeFilterCount = useMemo(
    () =>
      [
        isSuperAdmin && filterCompany !== "all",
        filterDepartment !== "all",
        filterBranch !== "all",
        filterStatus !== "all",
        searchTerm !== "",
      ].filter(Boolean).length,
    [filterBranch, filterCompany, filterDepartment, filterStatus, isSuperAdmin, searchTerm],
  );

  const filteredDepartments = useMemo(
    () =>
      isSuperAdmin && filterCompany !== "all"
        ? departments.filter((dept) => dept.tenantId === filterCompany)
        : departments,
    [departments, filterCompany, isSuperAdmin],
  );

  const filteredBranches = useMemo(
    () => isSuperAdmin && filterCompany !== "all"
      ? branches.filter((branch) => branch.tenantId === filterCompany)
      : branches,
    [branches, filterCompany, isSuperAdmin],
  );

  const clearFilters = useCallback(() => {
    setFilterDepartment("all");
    setFilterStatus("all");
    setFilterCompany("all");
    setFilterBranch("all");
    setSearchTerm("");
  }, []);

  const onAdd = useCallback(() => {
    setDetailItem(undefined);
    setShowFormModal(true);
  }, []);

  const onView = useCallback((employee: UserDto) => {
    setDetailItem(employee);
    setShowFormModal(true);
  }, []);

  const onViewRecap = useCallback((employee: UserDto) => {
    setRecapEmployee(employee);
  }, []);

  const onDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal menghapus karyawan");

      toast.success("Gagal menghapus karyawan!");
      fetchData();
    } catch (error) {
      toast.error(`Gagal menghapus karyawan: ${error instanceof Error ? error.message : "Unknown error"}`);
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
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterDepartment !== "all")
        params.set("departmentId", filterDepartment);
      if (filterBranch !== "all") params.set("branchId", filterBranch);
      if (isSuperAdmin && filterCompany !== "all") {
        params.set("tenantId", filterCompany);
      }

      const res = await fetch(`/api/users?${params.toString()}`);
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data untuk export"),
        );
      }

      const json = await res.json();
      const allData: UserDto[] = json.data || [];

      const XLSX = await import("xlsx");

      const rows = allData.map((emp) => {
        const row: Record<string, unknown> = {
          Perusahaan: isSuperAdmin ? emp.tenant?.companyName || "-" : undefined,
          NIK: emp.nik || "-",
          Nama: emp.name || "-",
          Role: emp.role?.name || "-",
          Email: emp.email || "-",
          "No. Telepon": emp.phone || "-",
          Posisi: emp.position || "-",
          "Jenis Kelamin":
            emp.gender === "male"
              ? "Laki-laki"
              : emp.gender === "female"
                ? "Perempuan"
                : "-",
          "Tempat Lahir": emp.birthPlace || "-",
          "Tanggal Lahir": formatDateId(emp.birthDate),
          Alamat: emp.address || "-",
          Departemen:
            emp.department?.name && isSuperAdmin
              ? `${emp.department.name} - ${emp.tenant?.companyName || "-"}`
              : emp.department?.name ? `Departemen ${emp.department?.name}` : "-",
          Cabang: emp.branch?.name ? `Cabang ${emp.branch?.name}` : "-",
          "Tanggal Bergabung": formatDateId(emp.joinDate),
          Status: emp.status === "active" ? "Aktif" : "Tidak Aktif",
          "Foto Wajah": emp.avatarUrl ? "Tersedia" : "Belum ada",
        };

        if (isSuperAdmin || isAdmin) {
          row["Gaji"] = emp.salary || 0;
          row["Jenis Pembayaran Gaji"] =
            emp.salaryType === "daily" ? "Harian" : "Bulanan";
        }

        if (!isSuperAdmin) {
          delete row["Perusahaan"];
        }

        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Karyawan");

      // Auto column width
      const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
        wch:
          Math.max(
            key.length,
            ...rows.map((r) => String(r[key] ?? "").length),
          ) + 2,
      }));
      worksheet["!cols"] = colWidths;

      // Format salary column as currency if Super Admin
      if (isSuperAdmin) {
        const salaryColIndex = Object.keys(rows[0] ?? {}).indexOf("Gaji");
        if (salaryColIndex >= 0) {
          const colLetter = XLSX.utils.encode_col(salaryColIndex);
          for (let i = 2; i <= rows.length + 1; i++) {
            const cellRef = `${colLetter}${i}`;
            if (worksheet[cellRef]) {
              worksheet[cellRef].z = "#,##0";
            }
          }
        }
      }

      const fileName = `data-karyawan-${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Berhasil mengexport ${allData.length} data karyawan`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengexport data",
      );
    } finally {
      setIsExporting(false);
    }
  }, [debouncedSearchTerm, filterBranch, filterDepartment, filterStatus, filterCompany, isSuperAdmin, isAdmin]);

  const onBulkDownload = useCallback(async (period: { month: number; year: number } | { startDate: string; endDate: string }) => {
    try {
      setIsBulkDownloading(true);

      const params = new URLSearchParams();
      params.set("limit", "999999");
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterDepartment !== "all")
        params.set("departmentId", filterDepartment);
      if (filterBranch !== "all") params.set("branchId", filterBranch);
      if (isSuperAdmin && filterCompany !== "all") {
        params.set("tenantId", filterCompany);
      }

      const usersRes = await fetch(`/api/users?${params.toString()}`);
      if (!usersRes.ok) {
        throw new Error(
          await parseApiError(usersRes, "Gagal mengambil data karyawan"),
        );
      }

      const usersJson = await usersRes.json();
      const allData: UserDto[] = usersJson.data || [];
      if (allData.length === 0) {
        toast.error("Tidak ada data karyawan untuk didownload");
        return;
      }

      const recapResults = await Promise.all(
        allData.map(async (employee) => {
          if (!employee.id) return null;
          const recapParams = new URLSearchParams();
          if ("startDate" in period) {
            recapParams.set("startDate", period.startDate);
            recapParams.set("endDate", period.endDate);
          } else {
            recapParams.set("month", String(period.month));
            recapParams.set("year", String(period.year));
          }
          const recapRes = await fetch(`/api/users/${employee.id}/recap?${recapParams.toString()}`);
          if (!recapRes.ok) return null;
          const recapJson = await recapRes.json();
          return {
            employee,
            recap: recapJson.data as EmployeeRecapDto,
          };
        }),
      );

      const printableRows = recapResults.filter(
        (row): row is { employee: UserDto; recap: EmployeeRecapDto } => Boolean(row),
      );

      if (printableRows.length === 0) {
        toast.error("Gagal mengambil data rekap karyawan");
        return;
      }

      const printDiv = document.createElement("div");
      printDiv.id = "temp-bulk-recap-print-area";
      printDiv.innerHTML = buildEmployeeRecapPrintHtml(
        printableRows.map(({ employee, recap }) => ({
          employee,
          recap,
          brand: {
            companyName: employee.tenant?.companyName,
            logoUrl: employee.tenant?.logoUrl,
          },
        })),
      );
      document.body.appendChild(printDiv);

      const style = document.createElement("style");
      style.id = "temp-bulk-recap-print-style";
      style.innerHTML = `
        @media print {
          body > *:not(#temp-bulk-recap-print-area) { display: none !important; }
          #temp-bulk-recap-print-area {
            display: block !important;
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            background: white !important;
            z-index: 99999 !important;
          }
          #temp-bulk-recap-print-area * { visibility: visible !important; }
          body, html { height: auto !important; overflow: visible !important; background: white !important; }
        }
      `;
      document.head.appendChild(style);
      await waitForEmployeeRecapImages(printDiv);

      const oldTitle = document.title;
      document.title = "startDate" in period
        ? `rekap-karyawan-${period.startDate}_${period.endDate}`
        : `rekap-karyawan-${period.year}-${String(period.month).padStart(2, "0")}`;

      const cleanup = () => {
        if (document.body.contains(printDiv)) document.body.removeChild(printDiv);
        if (document.head.contains(style)) document.head.removeChild(style);
        document.title = oldTitle;
        window.removeEventListener("afterprint", cleanup);
      };

      window.addEventListener("afterprint", cleanup);
      window.print();
      setTimeout(cleanup, 60000);

      const failedCount = allData.length - printableRows.length;
      toast.success(
        failedCount > 0
          ? `Menyiapkan ${printableRows.length} rekap. ${failedCount} gagal dimuat.`
          : `Menyiapkan ${printableRows.length} rekap karyawan`,
      );
      setShowBulkRecapPeriod(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menyiapkan download bulk",
      );
    } finally {
      setIsBulkDownloading(false);
    }
  }, [debouncedSearchTerm, filterBranch, filterDepartment, filterStatus, filterCompany, isSuperAdmin]);

  const toolbar = useMemo(
    () =>
      headerToolbar({
        actions: {
          onAdd,
          onExport,
          onImport: () => setShowImportModal(true),
          onBulkDownload: () => setShowBulkRecapPeriod(true),
          onOpenDepartment: () => setShowDepartmentModal(true),
          checkRole,
          isExporting,
          isBulkDownloading,
          total,
        },
        filters: {
          show: showFilterPanel,
          setShow: setShowFilterPanel,
          activeCount: activeFilterCount,
          clear: clearFilters,
          searchTerm,
          setSearchTerm,
          department: filterDepartment,
          setDepartment: setFilterDepartment,
          branch: filterBranch,
          setBranch: setFilterBranch,
          status: filterStatus,
          setStatus: setFilterStatus,
          company: filterCompany,
          setCompany: setFilterCompany,
          departments: filteredDepartments,
          branches: filteredBranches,
          tenants,
          isSuperAdmin,
          getDepartmentDisplayName,
        },
      }),
    [
      onAdd,
      onExport,
      checkRole,
      isExporting,
      isBulkDownloading,
      total,
      showFilterPanel,
      activeFilterCount,
      clearFilters,
      searchTerm,
      filterDepartment,
      filterBranch,
      filterStatus,
      filterCompany,
      filteredDepartments,
      filteredBranches,
      tenants,
      isSuperAdmin,
      getDepartmentDisplayName,
    ],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterDepartment !== "all")
        params.set("departmentId", filterDepartment);
      if (filterBranch !== "all") params.set("branchId", filterBranch);
      if (isSuperAdmin && filterCompany !== "all") {
        params.set("tenantId", filterCompany);
      }

      const res = await fetch(`/api/users?${params.toString()}`);
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data karyawan"),
        );
      }
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat data karyawan",
      );
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, filterStatus, filterDepartment, filterBranch, filterCompany, isSuperAdmin]);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data departemen"),
        );
      }
      const json = await res.json();
      setDepartments(json.data || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat departemen",
      );
    }
  }, []);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/tenants?page=1&limit=100");
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil data tenant"),
        );
      }
      const json = await res.json();
      setTenants(json.data || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat data tenant",
      );
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const response = await fetch("/api/branches?page=1&limit=999999");
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengambil data cabang"));
      const json = await response.json();
      setBranches(json.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat data cabang");
    }
  }, []);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("hr_user_data") || "{}");
    setUserData(data);
  }, []);

  useEffect(() => {
    if (!canFetchDepartments) return;
    fetchDepartments();
  }, [canFetchDepartments, fetchDepartments]);

  useEffect(() => {
    if (!canFetchBranches) return;
    fetchBranches();
  }, [canFetchBranches, fetchBranches]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchTenants();
  }, [fetchTenants, isSuperAdmin]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filterBranch, filterDepartment, filterStatus, filterCompany]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (filterDepartment === "all") return;
    const exists = filteredDepartments.some((dept) => dept.id === filterDepartment);
    if (!exists) {
      setFilterDepartment("all");
    }
  }, [filterDepartment, filteredDepartments]);

  useEffect(() => {
    if (filterBranch === "all") return;
    const exists = filteredBranches.some((branch) => branch.id === filterBranch);
    if (!exists) setFilterBranch("all");
  }, [filterBranch, filteredBranches]);

  return (
    <>
      <DynamicPage
        toolbar={toolbar}
        columns={columnFormats({
          isSuperAdmin,
          isAdmin,
          getDepartmentDisplayName,
        })}
        items={data}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        loading={loading}
        emptyMessage="Tidak ada data karyawan yang ditemukan"
        onPageChange={setCurrentPage}
        renderActions={(row) =>
          renderActions({
            row,
            checkRole,
            onViewRecap,
            onView,
            onDelete,
            deleteId,
            setDeleteId,
          })
        }
      />

      <FormData
        isOpen={showFormModal}
        initialData={detailItem}
        departments={departments}
        onClose={() => {
          setShowFormModal(false);
          setDetailItem(undefined);
        }}
        onSuccess={fetchData}
      />

      {/* Department Management Modal */}
      <DepartmentModal
        isOpen={showDepartmentModal}
        onClose={() => setShowDepartmentModal(false)}
        departments={departments}
        branches={branches}
        onRefresh={fetchDepartments}
      />

      <ImportModal
        isOpen={showImportModal}
        isSuperAdmin={isSuperAdmin}
        onClose={() => setShowImportModal(false)}
        onSuccess={fetchData}
      />

      <BulkRecapPeriodDialog
        open={showBulkRecapPeriod}
        loading={isBulkDownloading}
        onOpenChange={setShowBulkRecapPeriod}
        onConfirm={onBulkDownload}
      />

      {/* Recap Modal */}
      {recapEmployee && (
        <RecapModal
          employee={recapEmployee}
          onClose={() => setRecapEmployee(null)}
        />
      )}
    </>
  );
}
