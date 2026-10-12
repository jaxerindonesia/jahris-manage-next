"use client";

import DynamicPage from "@/components/dynamic-page";
import type { PlanDto } from "@/lib/dto/subscription";
import {
  ITEMS_PER_PAGE,
  useSubscriptionManagement,
} from "@/lib/hooks/use-subscription-management";
import {
  ManagementActions,
  ManagementAccessDenied,
  ManagementToolbar,
} from "../subscriptions/page.config";
import PlanFormData from "./components/form-data";
import { planColumns } from "./page.config";

export default function PlansPage() {
  const management = useSubscriptionManagement("plans", {
    loadError: "Gagal mengambil plan",
    deleteError: "Gagal menghapus plan",
    deleteSuccess: "Plan berhasil dihapus",
  });

  const renderActions = (row: PlanDto) =>
    <ManagementActions
      row={row}
      onEdit={management.openEditDialog}
      onDelete={management.handleDelete}
      deleteId={management.deleteId}
      setDeleteId={management.setDeleteId}
      deleteLabel="Plan"
    />;

  if (!management.isSuperAdmin) return <ManagementAccessDenied />;

  return (
    <>
      <DynamicPage<PlanDto>
        toolbar={
          <ManagementToolbar
            label="Plan"
            onAdd={management.openCreateDialog}
            showFilter={management.showFilter}
            setShowFilter={management.setShowFilter}
            search={management.search}
            setSearch={management.setSearch}
          />
        }
        columns={planColumns}
        items={management.rows}
        total={management.total}
        currentPage={management.page}
        totalPages={Math.max(1, Math.ceil(management.total / ITEMS_PER_PAGE))}
        loading={management.loading}
        emptyMessage="Belum ada plan"
        onPageChange={management.setPage}
        renderActions={renderActions}
      />
      <PlanFormData
        open={management.dialogOpen}
        initialData={management.selected}
        onClose={management.closeDialog}
        onSuccess={() => void management.loadRows()}
      />
    </>
  );
}
