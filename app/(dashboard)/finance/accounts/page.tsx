"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DynamicPage from "@/components/dynamic-page";
import type { AccountDto, AccountFormDto } from "@/lib/dto/finance-account";
import type { AccountCategoryDto } from "@/lib/dto/finance-account-category";
import { usePermission } from "@/lib/helper/check-role";
import { parseApiError } from "@/lib/helper/response-api";
import { toast } from "sonner";
import AccountImportModal from "../components/account-import-modal";
import FormData from "./components/form-data";
import {
  columnFormats,
  headerToolbar,
  ITEMS_PER_PAGE,
  renderActions,
} from "./page.config";

type PaginatedResponse<T> = {
  data?: T[];
  total?: number;
};

const DEFAULT_FORM: AccountFormDto = {
  id: "",
  code: "",
  name: "",
  normalBalance: "DEBIT",
  accountCategoryId: "",
  parentId: "",
  isActive: true,
};

const ENDPOINT = "/api/finance/accounts";

export default function FinanceAccountsPage() {
  const { checkRole } = usePermission();
  const [data, setData] = useState<AccountDto[]>([]);
  const [accountOptions, setAccountOptions] = useState<AccountDto[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<AccountCategoryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [status, setStatus] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [form, setForm] = useState<AccountFormDto>(DEFAULT_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const hasLoadedCategoryOptions = useRef(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)), [total]);
  const activeFilterCount = useMemo(
    () => [searchTerm !== "", status !== "all", categoryFilter !== "all"].filter(Boolean).length,
    [categoryFilter, searchTerm, status],
  );

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setStatus("all");
    setCategoryFilter("all");
  }, []);

  const fetchCategoryOptions = useCallback(async () => {
    const response = await fetch("/api/finance/account-categories?scope=options");
    const json: PaginatedResponse<AccountCategoryDto> = await response.json();
    setCategoryOptions(json.data || []);
    hasLoadedCategoryOptions.current = true;
  }, []);

  const fetchAccountOptions = useCallback(async () => {
    const response = await fetch("/api/finance/accounts?scope=options");
    const json: PaginatedResponse<AccountDto> = await response.json();
    setAccountOptions(json.data || []);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (status !== "all") params.set("status", status);
      if (categoryFilter !== "all") params.set("accountCategoryId", categoryFilter);

      const response = await fetch(`${ENDPOINT}?${params.toString()}`);
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengambil data akun"));
      const json: PaginatedResponse<AccountDto> = await response.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengambil data akun");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, currentPage, debouncedSearchTerm, status]);

  useEffect(() => {
    if (!hasLoadedCategoryOptions.current) {
      void fetchCategoryOptions();
    }
    void fetchAccountOptions();
  }, [fetchAccountOptions, fetchCategoryOptions]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, status, categoryFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const onAdd = useCallback(() => {
    setForm(DEFAULT_FORM);
    setShowDialog(true);
  }, []);

  const onView = useCallback((item: AccountDto) => {
    setForm({
      id: item.id,
      code: item.code,
      name: item.name,
      normalBalance: item.normalBalance,
      accountCategoryId: item.accountCategory?.id || "",
      parentId: item.parent?.id || "",
      isActive: item.isActive,
    });
    setShowDialog(true);
  }, []);

  const onSubmit = useCallback(async () => {
    if (saving) return;
    if (!form.code.trim() || !form.name.trim() || !form.accountCategoryId.trim() || !form.normalBalance.trim()) {
      toast.error("Kode, nama, kategori, dan saldo normal wajib diisi");
      return;
    }

    setSaving(true);
    setLoading(true);
    try {
      const response = await fetch(form.id ? `${ENDPOINT}/${form.id}` : ENDPOINT, {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.message || "Gagal menyimpan akun");
      }

      toast.success(form.id ? "Akun berhasil diupdate" : "Akun berhasil ditambahkan");
      setShowDialog(false);
      setForm(DEFAULT_FORM);
      await fetchData();
      await fetchAccountOptions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan akun");
    } finally {
      setLoading(false);
      setSaving(false);
    }
  }, [fetchAccountOptions, fetchData, form, saving]);

  const onDelete = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${ENDPOINT}/${id}`, { method: "DELETE" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Gagal menghapus akun");

      toast.success("Akun berhasil dihapus");
      await fetchData();
      await fetchAccountOptions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus akun");
    } finally {
      setDeleteId(null);
    }
  }, [fetchAccountOptions, fetchData]);

  const onExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "999999");
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (status !== "all") params.set("status", status);
      params.set("status", "active");
      if (categoryFilter !== "all") params.set("accountCategoryId", categoryFilter);

      const response = await fetch(`${ENDPOINT}?${params.toString()}`);
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengambil data akun untuk export"));

      const json: PaginatedResponse<AccountDto> = await response.json();
      const rows = (json.data || []).map((item) => ({
        Kode: item.code || "-",
        Nama: item.name || "-",
        "Kategori Akun": item.accountCategory?.name || "-",
        "Kode Kategori": item.accountCategory?.code || "-",
        "Saldo Normal": item.normalBalance || "-",
        Parent: item.parent ? `${item.parent.code} - ${item.parent.name}` : "-",
        Status: item.isActive ? "Aktif" : "Nonaktif",
      }));

      if (!rows.length) {
        toast.error("Tidak ada data akun untuk didownload");
        return;
      }

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Akun");

      type ExportRow = (typeof rows)[number];
      const headers = Object.keys(rows[0] ?? {}) as Array<keyof ExportRow>;
      worksheet["!cols"] = headers.map((header) => ({
        wch: Math.max(String(header).length, ...rows.map((row) => String(row[header] ?? "").length)) + 2,
      }));

      XLSX.writeFile(workbook, `data-akun-${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success(`Berhasil mengexport ${rows.length} data akun`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengexport data akun");
    } finally {
      setIsExporting(false);
    }
  }, [categoryFilter, debouncedSearchTerm, status]);

  const toolbar = useMemo(
    () =>
      headerToolbar({
        actions: {
          onAdd,
          onExport,
          onImport: () => setShowImportModal(true),
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
          status,
          setStatus,
          categoryFilter,
          setCategoryFilter,
          categoryOptions,
        },
      }),
    [
      activeFilterCount,
      categoryFilter,
      categoryOptions,
      checkRole,
      clearFilters,
      isExporting,
      onAdd,
      onExport,
      searchTerm,
      showFilterPanel,
      status,
    ],
  );

  return (
    <>
      <DynamicPage<AccountDto>
        toolbar={toolbar}
        columns={columnFormats}
        items={data}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        loading={loading}
        emptyMessage="Tidak ada data akun"
        onPageChange={setCurrentPage}
        renderActions={(row) =>
          renderActions({
            row,
            checkRole,
            onView,
            onDelete,
            deleteId,
            setDeleteId,
          })
        }
      />

      <FormData
        open={showDialog}
        loading={loading}
        categories={categoryOptions}
        accounts={accountOptions}
        form={form}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setForm(DEFAULT_FORM);
        }}
        onChange={setForm}
        onSubmit={onSubmit}
      />

      <AccountImportModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        onSuccess={() => {
          void fetchData();
          void fetchAccountOptions();
        }}
      />
    </>
  );
}
