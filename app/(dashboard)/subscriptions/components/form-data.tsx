"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { saveManagementRow } from "@/app/api/subscription-management/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  PaymentMethodOption,
  PlanOption,
  SubscriptionStatus,
  TenantOption,
  TenantSubscriptionDto,
} from "@/lib/dto/subscription";

type Props = {
  open: boolean;
  initialData?: TenantSubscriptionDto;
  tenants: TenantOption[];
  plans: PlanOption[];
  payments: PaymentMethodOption[];
  onClose: () => void;
  onSuccess: () => void;
};

type SubscriptionForm = {
  tenantId: string;
  planId: string;
  paymentMethodId: string;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
};

const EMPTY_FORM: SubscriptionForm = {
  tenantId: "",
  planId: "",
  paymentMethodId: "__none__",
  startDate: "",
  endDate: "",
  status: "PENDING",
};

export default function SubscriptionFormData({
  open,
  initialData,
  tenants,
  plans,
  payments,
  onClose,
  onSuccess,
}: Props) {
  const [form, setForm] = useState<SubscriptionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      tenantId: initialData?.tenantId || "",
      planId: initialData?.planId || "",
      paymentMethodId: initialData?.paymentMethodId || "__none__",
      startDate: initialData?.startDate.slice(0, 10) || "",
      endDate: initialData?.endDate.slice(0, 10) || "",
      status: initialData?.status || "PENDING",
    });
  }, [initialData, open]);

  const update = <K extends keyof SubscriptionForm>(
    key: K,
    value: SubscriptionForm[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await saveManagementRow(
        "subscriptions",
        {
          ...form,
          paymentMethodId: form.paymentMethodId === "__none__" ? null : form.paymentMethodId,
        },
        initialData?.id,
      );
      toast.success(`Langganan berhasil ${initialData ? "diperbarui" : "ditambahkan"}`);
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan langganan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit" : "Tambah"} Langganan Tenant</DialogTitle>
          <DialogDescription>
            Lengkapi data langganan tenant, lalu simpan perubahan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tenant">
              <Select
                required
                value={form.tenantId}
                onValueChange={(value) => update("tenantId", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Plan">
              <Select
                required
                value={form.planId}
                onValueChange={(value) => update("planId", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} - {plan.type === "MONTHLY" ? "Bulanan" : "Tahunan"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Metode pembayaran">
              <Select
                value={form.paymentMethodId}
                onValueChange={(value) => update("paymentMethodId", value)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Belum ditentukan</SelectItem>
                  {payments.map((payment) => (
                    <SelectItem key={payment.id} value={payment.id}>
                      {payment.name} - {payment.provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(value) => update("status", value as SubscriptionStatus)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal mulai">
              <Input
                required
                type="date"
                value={form.startDate}
                onChange={(event) => update("startDate", event.target.value)}
              />
            </Field>
            <Field label="Tanggal berakhir">
              <Input
                required
                type="date"
                min={form.startDate}
                value={form.endDate}
                onChange={(event) => update("endDate", event.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

