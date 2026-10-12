"use client";

import DynamicPage from "@/components/dynamic-page";
import type { PaymentMethodDto } from "@/lib/dto/subscription";
import {
  ITEMS_PER_PAGE,
  useSubscriptionManagement,
} from "@/lib/hooks/use-subscription-management";
import {
  ManagementActions,
  ManagementAccessDenied,
  ManagementToolbar,
} from "../subscriptions/page.config";
import PaymentMethodFormData from "./components/form-data";
import { paymentMethodColumns } from "./page.config";

export default function PaymentMethodsPage() {
  const management = useSubscriptionManagement("payment-methods", {
    loadError: "Gagal mengambil metode pembayaran",
    deleteError: "Gagal menghapus metode pembayaran",
    deleteSuccess: "Metode pembayaran berhasil dihapus",
  });

  const renderActions = (row: PaymentMethodDto) => (
    <ManagementActions
      row={row}
      onEdit={management.openEditDialog}
      onDelete={management.handleDelete}
      deleteId={management.deleteId}
      setDeleteId={management.setDeleteId}
      deleteLabel="Metode Pembayaran"
    />
  );

  if (!management.isSuperAdmin) return <ManagementAccessDenied />;

  return (
    <>
      <DynamicPage<PaymentMethodDto>
        toolbar={
          <ManagementToolbar
            label="Metode Pembayaran"
            onAdd={management.openCreateDialog}
            showFilter={management.showFilter}
            setShowFilter={management.setShowFilter}
            search={management.search}
            setSearch={management.setSearch}
          />
        }
        columns={paymentMethodColumns}
        items={management.rows}
        total={management.total}
        currentPage={management.page}
        totalPages={Math.max(1, Math.ceil(management.total / ITEMS_PER_PAGE))}
        loading={management.loading}
        emptyMessage="Belum ada metode pembayaran"
        onPageChange={management.setPage}
        renderActions={renderActions}
      />
      <PaymentMethodFormData
        open={management.dialogOpen}
        initialData={management.selected}
        onClose={management.closeDialog}
        onSuccess={() => void management.loadRows()}
      />
    </>
  );
}
