"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteManagementRow,
  fetchManagementRows,
} from "@/app/api/subscription-management/client";
import type { SubscriptionRowMap, SubscriptionTab } from "@/lib/dto/subscription";
import { useIsSuperAdmin } from "@/lib/helper/client-session";

export const ITEMS_PER_PAGE = 10;

type Messages = {
  loadError: string;
  deleteError: string;
  deleteSuccess: string;
};

export function useSubscriptionManagement<TTab extends SubscriptionTab>(
  tab: TTab,
  messages: Messages,
) {
  type Row = SubscriptionRowMap[TTab];

  const isSuperAdmin = useIsSuperAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Row>();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchManagementRows(tab, page, ITEMS_PER_PAGE, debouncedSearch);
      setRows(result.data);
      setTotal(result.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : messages.loadError);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, messages.loadError, page, tab]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteManagementRow(tab, id);
      toast.success(messages.deleteSuccess);
      setDeleteId(null);
      await loadRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : messages.deleteError);
    }
  }, [loadRows, messages.deleteError, messages.deleteSuccess, tab]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (isSuperAdmin) void loadRows();
  }, [isSuperAdmin, loadRows]);

  const openCreateDialog = useCallback(() => {
    setSelected(undefined);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((row: Row) => {
    setSelected(row);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setSelected(undefined);
  }, []);

  return {
    rows,
    total,
    page,
    setPage,
    search,
    setSearch,
    loading,
    showFilter,
    setShowFilter,
    dialogOpen,
    selected,
    deleteId,
    setDeleteId,
    isSuperAdmin,
    loadRows,
    handleDelete,
    openCreateDialog,
    openEditDialog,
    closeDialog,
  };
}
