"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import DynamicPage from "@/components/dynamic-page";
import type { PlanDto } from "@/lib/dto/subscription";
import { deleteSubscriptionRow, fetchSubscriptionRows } from "../subscriptions/actions";
import ManagementDialog from "../subscriptions/components/management-dialog";
import { headerToolbar, ITEMS_PER_PAGE, planColumns, renderManagementActions } from "../subscriptions/page.config";

export default function PlansPage() {
  const [rows, setRows] = useState<PlanDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<PlanDto>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const isSuperAdmin = useSyncExternalStore(() => () => {}, readSuperAdmin, () => false);
  const loadRows = useCallback(async () => {
    setLoading(true);
    try { const result = await fetchSubscriptionRows("plans", page, ITEMS_PER_PAGE, debouncedSearch); setRows(result.data as PlanDto[]); setTotal(result.total); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mengambil plan"); }
    finally { setLoading(false); }
  }, [debouncedSearch, page]);
  useEffect(() => { const timeout = window.setTimeout(() => setDebouncedSearch(search), 400); return () => window.clearTimeout(timeout); }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);
  useEffect(() => { if (isSuperAdmin) void loadRows(); }, [isSuperAdmin, loadRows]);
  const toolbar = useMemo(() => headerToolbar({ label: "Plan", onAdd: () => { setSelected(undefined); setDialogOpen(true); }, showFilter, setShowFilter, search, setSearch }), [search, showFilter]);
  const actions = (row: PlanDto) => renderManagementActions({ row, onEdit: (item) => { setSelected(item); setDialogOpen(true); }, onDelete: handleDelete, deleteId, setDeleteId, deleteLabel: "Plan" });
  async function handleDelete(id: string) { try { await deleteSubscriptionRow("plans", id); toast.success("Plan berhasil dihapus"); setDeleteId(null); await loadRows(); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal menghapus plan"); } }
  if (!isSuperAdmin) return <div className="rounded-xl border bg-white p-6 text-sm text-red-500 dark:border-gray-700 dark:bg-gray-800">Halaman ini hanya dapat diakses oleh Super Admin.</div>;
  return <><DynamicPage<PlanDto> toolbar={toolbar} columns={planColumns} items={rows} total={total} currentPage={page} totalPages={Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))} loading={loading} emptyMessage="Belum ada plan" onPageChange={setPage} renderActions={actions} /><ManagementDialog open={dialogOpen} tab="plans" initialData={selected} tenants={[]} plans={[]} payments={[]} onClose={() => { setDialogOpen(false); setSelected(undefined); }} onSuccess={() => void loadRows()} /></>;
}

function readSuperAdmin() { try { const user = JSON.parse(localStorage.getItem("hr_user_data") || "{}"); return String(user.role || user.roleName || "").toLowerCase().replace(/\s/g, "") === "superadmin"; } catch { return false; } }
