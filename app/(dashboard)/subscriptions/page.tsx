"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import DynamicPage from "@/components/dynamic-page";
import type {
  PaymentMethodOption,
  PlanOption,
  TenantOption,
  TenantSubscriptionDto,
} from "@/lib/dto/subscription";
import { fetchSubscriptionOptions } from "@/app/api/subscription-management/client";
import {
  ITEMS_PER_PAGE,
  useSubscriptionManagement,
} from "@/lib/hooks/use-subscription-management";
import SubscriptionFormData from "./components/form-data";
import {
  ManagementActions,
  ManagementAccessDenied,
  ManagementToolbar,
  subscriptionColumns,
} from "./page.config";

export default function TenantSubscriptionsPage() {
  const management = useSubscriptionManagement("subscriptions", {
    loadError: "Gagal mengambil langganan",
    deleteError: "Gagal menghapus langganan",
    deleteSuccess: "Langganan berhasil dihapus",
  });
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [payments, setPayments] = useState<PaymentMethodOption[]>([]);

  const loadOptions = useCallback(async () => {
    try {
      const options = await fetchSubscriptionOptions();
      setTenants(options.tenants);
      setPlans(options.plans);
      setPayments(options.payments);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengambil pilihan data");
    }
  }, []);

  useEffect(() => {
    if (!management.isSuperAdmin) return;

    let cancelled = false;
    void fetchSubscriptionOptions()
      .then((options) => {
        if (cancelled) return;
        setTenants(options.tenants);
        setPlans(options.plans);
        setPayments(options.payments);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Gagal mengambil pilihan data");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [management.isSuperAdmin]);

  const renderActions = (row: TenantSubscriptionDto) =>
    <ManagementActions
      row={row}
      onEdit={management.openEditDialog}
      onDelete={management.handleDelete}
      deleteId={management.deleteId}
      setDeleteId={management.setDeleteId}
      deleteLabel="Langganan"
    />;

  if (!management.isSuperAdmin) return <ManagementAccessDenied />;

  return (
    <>
      <DynamicPage<TenantSubscriptionDto>
        toolbar={
          <ManagementToolbar
            label="Langganan"
            onAdd={management.openCreateDialog}
            showFilter={management.showFilter}
            setShowFilter={management.setShowFilter}
            search={management.search}
            setSearch={management.setSearch}
          />
        }
        columns={subscriptionColumns}
        items={management.rows}
        total={management.total}
        currentPage={management.page}
        totalPages={Math.max(1, Math.ceil(management.total / ITEMS_PER_PAGE))}
        loading={management.loading}
        emptyMessage="Belum ada langganan tenant"
        onPageChange={management.setPage}
        renderActions={renderActions}
      />
      <SubscriptionFormData
        open={management.dialogOpen}
        initialData={management.selected}
        tenants={tenants}
        plans={plans}
        payments={payments}
        onClose={management.closeDialog}
        onSuccess={() => {
          void management.loadRows();
          void loadOptions();
        }}
      />
    </>
  );
}
