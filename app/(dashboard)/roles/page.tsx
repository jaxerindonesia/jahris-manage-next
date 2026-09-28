"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DynamicPage from "@/components/dynamic-page";
import { RoleDto } from "@/lib/dto/role";
import { usePermission } from "@/lib/helper/check-role";
import { parseApiError } from "@/lib/helper/response-api";
import { toast } from "sonner";
import FormData from "./components/form-data";
import {
  columnFormats,
  headerToolbar,
  ITEMS_PER_PAGE,
  renderActions,
} from "./page.config";

const DEFAULT_FORM_DATA: RoleDto = {
  name: "",
  permission: [],
};

export default function Page() {
  const { checkRole } = usePermission();
  const [data, setData] = useState<RoleDto[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [detailItem, setDetailItem] = useState<RoleDto | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
    [total],
  );

  const activeFilterCount = useMemo(
    () => (searchTerm ? 1 : 0),
    [searchTerm],
  );

  const clearFilters = useCallback(() => {
    setSearchTerm("");
  }, []);

  const onAdd = useCallback(() => {
    setDetailItem(undefined);
    setShowModal(true);
  }, []);

  const onView = useCallback((role: RoleDto) => {
    setDetailItem(role);
    setShowModal(true);
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (debouncedSearchTerm) params.set("search", debouncedSearchTerm);

      const response = await fetch(`/api/roles?${params.toString()}`);
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengambil data role"));

      const json = await response.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengambil data role");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm]);

  const onDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/roles/${id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal menghapus role");

      toast.success("Role berhasil dihapus!");
      fetchRoles();
    } catch (error) {
      toast.error(`Gagal menghapus role: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDeleteId(null);
    }
  }, [fetchRoles]);

  const toolbar = useMemo(
    () =>
      headerToolbar({
        actions: {
          onAdd,
          checkRole,
        },
        filters: {
          show: showFilterPanel,
          setShow: setShowFilterPanel,
          activeCount: activeFilterCount,
          clear: clearFilters,
          searchTerm,
          setSearchTerm,
        },
      }),
    [
      activeFilterCount,
      checkRole,
      clearFilters,
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
  }, [debouncedSearchTerm]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  return (
    <>
      <DynamicPage<RoleDto>
        toolbar={toolbar}
        columns={columnFormats}
        items={data}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        loading={loading}
        emptyMessage="Tidak ada data role"
        bodyRowClassName="align-top"
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
        isOpen={showModal}
        initialData={detailItem ?? DEFAULT_FORM_DATA}
        onClose={() => {
          setShowModal(false);
          setDetailItem(undefined);
        }}
        onSuccess={fetchRoles}
      />
    </>
  );
}
