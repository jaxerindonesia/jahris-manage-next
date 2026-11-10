"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import DynamicPage from "@/components/dynamic-page";
import type { ActivityLogDto } from "@/lib/dto/activity-log";
import { parseApiError } from "@/lib/helper/response-api";
import DetailDialog from "./components/detail-dialog";
import {
  buildColumnFormats,
  headerToolbar,
  ITEMS_PER_PAGE,
  renderActions,
} from "./page.config";
import type { ActivityLogTenantOption } from "./types";

export default function ActivityLogsPage() {
  const [roleName, setRoleName] = useState<string | null>(null);
  const isSuperAdmin = roleName === "Super Admin";
  const [data, setData] = useState<ActivityLogDto[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<ActivityLogTenantOption[]>([]);
  const [detailLog, setDetailLog] = useState<ActivityLogDto | null>(null);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filterModule, setFilterModule] = useState("all");
  const [filterTenant, setFilterTenant] = useState("all");

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
    [total],
  );

  const activeFilterCount = useMemo(
    () => [searchTerm, filterModule !== "all", filterTenant !== "all"].filter(Boolean).length,
    [filterModule, filterTenant, searchTerm],
  );

  const columns = useMemo(() => buildColumnFormats(isSuperAdmin), [isSuperAdmin]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setFilterModule("all");
    setFilterTenant("all");
  }, []);

  const fetchActivityLogs = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);
      if (filterModule !== "all") params.set("module", filterModule);
      if (isSuperAdmin && filterTenant !== "all") params.set("tenantId", filterTenant);

      const response = await fetch(`/api/activity-logs?${params.toString()}`);
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengambil log aktivitas"));

      const json = await response.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengambil log aktivitas");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, filterModule, filterTenant, isSuperAdmin]);

  const fetchTenants = useCallback(async () => {
    try {
      const response = await fetch("/api/tenants?page=1&limit=100");
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengambil data tenant"));
      const json = await response.json();
      setTenants(json.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat data tenant");
    }
  }, []);

  const toolbar = useMemo(
    () =>
      headerToolbar({
        isSuperAdmin,
        tenants,
        filters: {
          show: showFilterPanel,
          setShow: setShowFilterPanel,
          activeCount: activeFilterCount,
          clear: clearFilters,
          searchTerm,
          setSearchTerm,
          module: filterModule,
          setModule: setFilterModule,
          tenantId: filterTenant,
          setTenantId: setFilterTenant,
        },
      }),
    [activeFilterCount, clearFilters, filterModule, filterTenant, isSuperAdmin, searchTerm, showFilterPanel, tenants],
  );

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("hr_user_data") || "{}");
    setRoleName(String(userData.role ?? ""));
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchTenants();
  }, [fetchTenants, isSuperAdmin]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filterModule, filterTenant]);

  useEffect(() => {
    if (roleName === null) return;
    fetchActivityLogs();
  }, [fetchActivityLogs, roleName]);

  return (
    <>
      <DynamicPage<ActivityLogDto>
        toolbar={toolbar}
        columns={columns}
        items={data}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        loading={loading}
        emptyMessage="Belum ada log aktivitas"
        bodyRowClassName="align-top"
        onPageChange={setCurrentPage}
        renderActions={(row) => renderActions({ row, onView: setDetailLog })}
      />

      <DetailDialog log={detailLog} onClose={() => setDetailLog(null)} />
    </>
  );
}
