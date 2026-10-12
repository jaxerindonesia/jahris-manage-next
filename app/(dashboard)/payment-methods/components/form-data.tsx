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
import { NumberField } from "@/components/number-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentMethodDto } from "@/lib/dto/subscription";

type Props = {
  open: boolean;
  initialData?: PaymentMethodDto;
  onClose: () => void;
  onSuccess: () => void;
};

type PaymentMethodForm = {
  name: string;
  code: string;
  description: string;
  provider: string;
  providerCode: string;
  category: string;
  feeType: string;
  feeFixed: string;
  feePercentage: string;
  feeBearer: string;
  minAmount: string;
  maxAmount: string;
  iconUrl: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY_FORM: PaymentMethodForm = {
  name: "",
  code: "",
  description: "",
  provider: "",
  providerCode: "",
  category: "virtual_account",
  feeType: "fixed",
  feeFixed: "0",
  feePercentage: "0",
  feeBearer: "customer",
  minAmount: "0",
  maxAmount: "",
  iconUrl: "",
  sortOrder: "0",
  isActive: true,
};

export default function PaymentMethodFormData({ open, initialData, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<PaymentMethodForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: initialData?.name || "",
      code: initialData?.code || "",
      description: initialData?.description || "",
      provider: initialData?.provider || "",
      providerCode: initialData?.providerCode || "",
      category: initialData?.category || "virtual_account",
      feeType: initialData?.feeType || "fixed",
      feeFixed: initialData?.feeFixed || "0",
      feePercentage: initialData?.feePercentage || "0",
      feeBearer: initialData?.feeBearer || "customer",
      minAmount: initialData?.minAmount || "0",
      maxAmount: initialData?.maxAmount || "",
      iconUrl: initialData?.iconUrl || "",
      sortOrder: String(initialData?.sortOrder ?? 0),
      isActive: initialData?.isActive ?? true,
    });
  }, [initialData, open]);

  const update = <K extends keyof PaymentMethodForm>(
    key: K,
    value: PaymentMethodForm[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await saveManagementRow("payment-methods", form, initialData?.id);
      toast.success(
        `Metode pembayaran berhasil ${initialData ? "diperbarui" : "ditambahkan"}`,
      );
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan metode pembayaran");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit" : "Tambah"} Metode Pembayaran</DialogTitle>
          <DialogDescription>
            Lengkapi data metode pembayaran, lalu simpan perubahan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama metode">
              <Input
                required
                maxLength={100}
                placeholder="BCA Virtual Account"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            <Field label="Code">
              <Input
                required
                maxLength={50}
                placeholder="bca_va"
                value={form.code}
                onChange={(event) =>
                  update("code", event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
                }
              />
            </Field>
          </div>

          <Field label="Deskripsi">
            <Textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider">
              <Input
                required
                maxLength={50}
                placeholder="midtrans"
                value={form.provider}
                onChange={(event) => update("provider", event.target.value)}
              />
            </Field>
            <Field label="Provider code">
              <Input
                maxLength={100}
                placeholder="Kode channel provider"
                value={form.providerCode}
                onChange={(event) => update("providerCode", event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kategori">
              <Select value={form.category} onValueChange={(value) => update("category", value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="virtual_account">Virtual Account</SelectItem>
                  <SelectItem value="e_wallet">E-Wallet</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fee type">
              <Select value={form.feeType} onValueChange={(value) => update("feeType", value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Biaya tetap (Rp)"
              value={form.feeFixed}
              step="0.01"
              onChange={(value) => update("feeFixed", value)}
            />
            <NumberField
              label="Biaya persentase (%)"
              value={form.feePercentage}
              step="0.0001"
              onChange={(value) => update("feePercentage", value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Penanggung biaya">
              <Select value={form.feeBearer} onValueChange={(value) => update("feeBearer", value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="merchant">Merchant</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Status penggunaan">
              <label className="flex h-9 w-full items-center gap-3 rounded-lg border px-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => update("isActive", event.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                Aktif dan dapat digunakan
              </label>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Minimum pembayaran"
              value={form.minAmount}
              step="0.01"
              onChange={(value) => update("minAmount", value)}
            />
            <NumberField
              label="Maksimum pembayaran"
              value={form.maxAmount}
              step="0.01"
              placeholder="Tanpa batas"
              onChange={(value) => update("maxAmount", value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Icon URL">
              <Input
                type="url"
                placeholder="https://..."
                value={form.iconUrl}
                onChange={(event) => update("iconUrl", event.target.value)}
              />
            </Field>
            <NumberField
              label="Urutan tampilan"
              value={form.sortOrder}
              step="1"
              onChange={(value) => update("sortOrder", value)}
            />
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

