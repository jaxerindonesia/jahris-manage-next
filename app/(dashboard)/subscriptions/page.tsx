"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import DynamicPage from "@/components/dynamic-page";
import type { TenantSubscriptionDto } from "@/lib/dto/subscription";
import { deleteSubscriptionRow, fetchSubscriptionOptions, fetchSubscriptionRows } from "./actions";
import ManagementDialog from "./components/management-dialog";
import { headerToolbar, ITEMS_PER_PAGE, renderManagementActions, subscriptionColumns } from "./page.config";
import type { PaymentMethodOption, PlanOption, TenantOption } from "./types";

export default function TenantSubscriptionsPage() {
  const [rows, setRows] = useState<TenantSubscriptionDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<TenantSubscriptionDto>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [payments, setPayments] = useState<PaymentMethodOption[]>([]);
  const isSuperAdmin = useSyncExternalStore(() => () => {}, readSuperAdmin, () => false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSubscriptionRows("subscriptions", page, ITEMS_PER_PAGE, debouncedSearch);
      setRows(result.data as TenantSubscriptionDto[]);
      setTotal(result.total);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mengambil langganan"); }
    finally { setLoading(false); }
  }, [debouncedSearch, page]);

  const loadOptions = useCallback(async () => {
    try {
      const data = await fetchSubscriptionOptions();
      setTenants(data.tenants); setPlans(data.plans); setPayments(data.payments);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mengambil pilihan data"); }
  }, []);

  useEffect(() => { const timeout = window.setTimeout(() => setDebouncedSearch(search), 400); return () => window.clearTimeout(timeout); }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);
  useEffect(() => { if (isSuperAdmin) void loadRows(); }, [isSuperAdmin, loadRows]);
  useEffect(() => { if (isSuperAdmin) void loadOptions(); }, [isSuperAdmin, loadOptions]);

  const toolbar = useMemo(() => headerToolbar({ label: "Langganan", onAdd: () => { setSelected(undefined); setDialogOpen(true); }, showFilter, setShowFilter, search, setSearch }), [search, showFilter]);
  const actions = (row: TenantSubscriptionDto) => renderManagementActions({ row, onEdit: (item) => { setSelected(item); setDialogOpen(true); }, onDelete: handleDelete, deleteId, setDeleteId, deleteLabel: "Langganan" });

  async function handleDelete(id: string) {
    try { await deleteSubscriptionRow("subscriptions", id); toast.success("Langganan berhasil dihapus"); setDeleteId(null); await loadRows(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Gagal menghapus langganan"); }
  }

  if (!isSuperAdmin) return <AccessDenied />;
  return <>
    <DynamicPage<TenantSubscriptionDto> toolbar={toolbar} columns={subscriptionColumns} items={rows} total={total} currentPage={page} totalPages={Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))} loading={loading} emptyMessage="Belum ada langganan tenant" onPageChange={setPage} renderActions={actions} />
    <ManagementDialog open={dialogOpen} tab="subscriptions" initialData={selected} tenants={tenants} plans={plans} payments={payments} onClose={() => { setDialogOpen(false); setSelected(undefined); }} onSuccess={() => { void loadRows(); void loadOptions(); }} />
  </>;
}

function readSuperAdmin() { try { const user = JSON.parse(localStorage.getItem("hr_user_data") || "{}"); return String(user.role || user.roleName || "").toLowerCase().replace(/\s/g, "") === "superadmin"; } catch { return false; } }
function AccessDenied() { return <div className="rounded-xl border bg-white p-6 text-sm text-red-500 dark:border-gray-700 dark:bg-gray-800">Halaman ini hanya dapat diakses oleh Super Admin.</div>; }
