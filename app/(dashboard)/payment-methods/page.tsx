"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import DynamicPage from "@/components/dynamic-page";
import type { PaymentMethodDto } from "@/lib/dto/subscription";
import { deleteSubscriptionRow, fetchSubscriptionRows } from "../subscriptions/actions";
import ManagementDialog from "../subscriptions/components/management-dialog";
import { headerToolbar, ITEMS_PER_PAGE, paymentMethodColumns, renderManagementActions } from "../subscriptions/page.config";

export default function PaymentMethodsPage() {
  const [rows, setRows] = useState<PaymentMethodDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentMethodDto>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const isSuperAdmin = useSyncExternalStore(() => () => {}, readSuperAdmin, () => false);
  const loadRows = useCallback(async () => {
    setLoading(true);
    try { const result = await fetchSubscriptionRows("payment-methods", page, ITEMS_PER_PAGE, debouncedSearch); setRows(result.data as PaymentMethodDto[]); setTotal(result.total); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mengambil metode pembayaran"); }
    finally { setLoading(false); }
  }, [debouncedSearch, page]);
  useEffect(() => { const timeout = window.setTimeout(() => setDebouncedSearch(search), 400); return () => window.clearTimeout(timeout); }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);
  useEffect(() => { if (isSuperAdmin) void loadRows(); }, [isSuperAdmin, loadRows]);
  const toolbar = useMemo(() => headerToolbar({ label: "Metode Pembayaran", onAdd: () => { setSelected(undefined); setDialogOpen(true); }, showFilter, setShowFilter, search, setSearch }), [search, showFilter]);
  const actions = (row: PaymentMethodDto) => renderManagementActions({ row, onEdit: (item) => { setSelected(item); setDialogOpen(true); }, onDelete: handleDelete, deleteId, setDeleteId, deleteLabel: "Metode Pembayaran" });
  async function handleDelete(id: string) { try { await deleteSubscriptionRow("payment-methods", id); toast.success("Metode pembayaran berhasil dihapus"); setDeleteId(null); await loadRows(); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal menghapus metode pembayaran"); } }
  if (!isSuperAdmin) return <div className="rounded-xl border bg-white p-6 text-sm text-red-500 dark:border-gray-700 dark:bg-gray-800">Halaman ini hanya dapat diakses oleh Super Admin.</div>;
  return <><DynamicPage<PaymentMethodDto> toolbar={toolbar} columns={paymentMethodColumns} items={rows} total={total} currentPage={page} totalPages={Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))} loading={loading} emptyMessage="Belum ada metode pembayaran" onPageChange={setPage} renderActions={actions} /><ManagementDialog open={dialogOpen} tab="payment-methods" initialData={selected} tenants={[]} plans={[]} payments={[]} onClose={() => { setDialogOpen(false); setSelected(undefined); }} onSuccess={() => void loadRows()} /></>;
}

function readSuperAdmin() { try { const user = JSON.parse(localStorage.getItem("hr_user_data") || "{}"); return String(user.role || user.roleName || "").toLowerCase().replace(/\s/g, "") === "superadmin"; } catch { return false; } }
