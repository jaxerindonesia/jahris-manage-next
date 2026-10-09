"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentMethodDto, PlanDto, TenantSubscriptionDto } from "@/lib/dto/subscription";
import { saveSubscriptionRow } from "../actions";
import type { PaymentMethodOption, PlanOption, SubscriptionRow, SubscriptionTab, TenantOption } from "../types";

type Props = {
  open: boolean;
  tab: SubscriptionTab;
  initialData?: SubscriptionRow;
  tenants: TenantOption[];
  plans: PlanOption[];
  payments: PaymentMethodOption[];
  onClose: () => void;
  onSuccess: () => void;
};

const splitLines = (value: string) => value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);

const PLAN_FEATURES = [
  { value: "*", label: "Semua fitur (Enterprise)" },
  { value: "dashboard", label: "Dashboard HR" },
  { value: "users", label: "Data Karyawan" },
  { value: "branches", label: "Cabang" },
  { value: "work-shifts", label: "Shift Kerja" },
  { value: "shift-schedules", label: "Jadwal Shift" },
  { value: "submissions", label: "Pengajuan cuti / izin" },
  { value: "attendances", label: "Absensi & kehadiran" },
  { value: "face-recognition", label: "Face Recognition" },
  { value: "basic-reporting", label: "Basic reporting" },
  { value: "task-managements", label: "Manajemen Tugas" },
  { value: "payrolls", label: "Payroll" },
  { value: "reimbursements", label: "Reimbursement" },
  { value: "overtimes", label: "Lembur" },
  { value: "pettycash", label: "Petty Cash" },
  { value: "finance", label: "Keuangan" },
  { value: "performances", label: "Penilaian Kinerja (KPI)" },
];

export default function ManagementDialog({ open, tab, initialData, tenants, plans, payments, onClose, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (tab === "plans") {
      const item = initialData as PlanDto | undefined;
      setForm({ name: item?.name || "", description: item?.description || "", featureDescription: item?.featureDescription?.join("\n") || "", featurePermission: item?.featurePermission?.join("\n") || "", price: item?.price?.toString() || "", type: item?.type || "MONTHLY", isActive: item?.isActive ?? true });
    } else if (tab === "payment-methods") {
      const item = initialData as PaymentMethodDto | undefined;
      setForm({ name: item?.name || "", code: item?.code || "", description: item?.description || "", provider: item?.provider || "", providerCode: item?.providerCode || "", category: item?.category || "virtual_account", feeType: item?.feeType || "fixed", feeFixed: item?.feeFixed || "0", feePercentage: item?.feePercentage || "0", feeBearer: item?.feeBearer || "customer", minAmount: item?.minAmount || "0", maxAmount: item?.maxAmount || "", iconUrl: item?.iconUrl || "", sortOrder: String(item?.sortOrder ?? 0), isActive: item?.isActive ?? true });
    } else {
      const item = initialData as TenantSubscriptionDto | undefined;
      setForm({ tenantId: item?.tenantId || "", planId: item?.planId || "", paymentMethodId: item?.paymentMethodId || "__none__", startDate: item?.startDate?.slice(0, 10) || "", endDate: item?.endDate?.slice(0, 10) || "", status: item?.status || "PENDING" });
    }
  }, [initialData, open, tab]);

  const title = tab === "plans" ? "Plan" : tab === "payment-methods" ? "Metode Pembayaran" : "Subscription Tenant";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = tab === "plans"
        ? { ...form, price: form.price === "" ? null : Number(form.price), featureDescription: splitLines(String(form.featureDescription)), featurePermission: splitLines(String(form.featurePermission)) }
        : tab === "subscriptions"
          ? { ...form, paymentMethodId: form.paymentMethodId === "__none__" ? null : form.paymentMethodId }
          : form;
      await saveSubscriptionRow(tab, payload, initialData?.id);
      toast.success(`${title} berhasil ${initialData ? "diperbarui" : "ditambahkan"}`);
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan data");
    } finally {
      setSaving(false);
    }
  }

  const update = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  const selectedPlanFeatures = splitLines(String(form.featurePermission || ""));
  const togglePlanFeature = (feature: string, checked: boolean) => {
    const next = checked
      ? feature === "*"
        ? ["*"]
        : [...selectedPlanFeatures.filter((item) => item !== "*"), feature]
      : selectedPlanFeatures.filter((item) => item !== feature);
    update("featurePermission", [...new Set(next)].join("\n"));
  };

  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{initialData ? "Edit" : "Tambah"} {title}</DialogTitle><DialogDescription>Lengkapi data berikut, lalu simpan perubahan.</DialogDescription></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        {tab === "plans" && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama plan"><Input required value={String(form.name || "")} onChange={(e) => update("name", e.target.value)} /></Field>
            <Field label="Periode"><Select value={String(form.type || "MONTHLY")} onValueChange={(value) => update("type", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MONTHLY">Bulanan</SelectItem><SelectItem value="YEARLY">Tahunan</SelectItem></SelectContent></Select></Field>
          </div>
          <Field label="Deskripsi"><Textarea required value={String(form.description || "")} onChange={(e) => update("description", e.target.value)} /></Field>
          <Field label="Harga per karyawan (kosongkan untuk Custom Pricing)"><Input type="number" min="0" value={String(form.price ?? "")} onChange={(e) => update("price", e.target.value)} /></Field>
          <Field label="Daftar fitur untuk ditampilkan (satu per baris)"><Textarea className="min-h-32" value={String(form.featureDescription || "")} onChange={(e) => update("featureDescription", e.target.value)} /></Field>
          <Field label="Hak akses fitur plan">
            <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
              {PLAN_FEATURES.map((feature) => (
                <label key={feature.value} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={selectedPlanFeatures.includes(feature.value)}
                    disabled={feature.value !== "*" && selectedPlanFeatures.includes("*")}
                    onChange={(event) => togglePlanFeature(feature.value, event.target.checked)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  {feature.label}
                </label>
              ))}
            </div>
          </Field>
          <ActiveField checked={Boolean(form.isActive)} onChange={(value) => update("isActive", value)} />
        </>}

        {tab === "payment-methods" && <>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Nama metode"><Input required maxLength={100} placeholder="BCA Virtual Account" value={String(form.name || "")} onChange={(e) => update("name", e.target.value)} /></Field><Field label="Code"><Input required maxLength={50} placeholder="bca_va" value={String(form.code || "")} onChange={(e) => update("code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} /></Field></div>
          <Field label="Deskripsi"><Textarea value={String(form.description || "")} onChange={(e) => update("description", e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Provider"><Input required maxLength={50} placeholder="midtrans" value={String(form.provider || "")} onChange={(e) => update("provider", e.target.value)} /></Field><Field label="Provider code"><Input maxLength={100} placeholder="Kode channel provider" value={String(form.providerCode || "")} onChange={(e) => update("providerCode", e.target.value)} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Kategori"><Select value={String(form.category || "virtual_account")} onValueChange={(value) => update("category", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="virtual_account">Virtual Account</SelectItem><SelectItem value="e_wallet">E-Wallet</SelectItem><SelectItem value="qris">QRIS</SelectItem><SelectItem value="credit_card">Credit Card</SelectItem></SelectContent></Select></Field><Field label="Fee type"><Select value={String(form.feeType || "fixed")} onValueChange={(value) => update("feeType", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">Fixed</SelectItem><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent></Select></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Biaya tetap (Rp)"><Input type="number" min="0" step="0.01" value={String(form.feeFixed || "0")} onChange={(e) => update("feeFixed", e.target.value)} /></Field><Field label="Biaya persentase (%)"><Input type="number" min="0" step="0.0001" value={String(form.feePercentage || "0")} onChange={(e) => update("feePercentage", e.target.value)} /></Field></div>
          <Field label="Penanggung biaya"><Select value={String(form.feeBearer || "customer")} onValueChange={(value) => update("feeBearer", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="customer">Customer</SelectItem><SelectItem value="merchant">Merchant</SelectItem></SelectContent></Select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Minimum pembayaran"><Input type="number" min="0" step="0.01" value={String(form.minAmount || "0")} onChange={(e) => update("minAmount", e.target.value)} /></Field><Field label="Maksimum pembayaran"><Input type="number" min="0" step="0.01" placeholder="Tanpa batas" value={String(form.maxAmount || "")} onChange={(e) => update("maxAmount", e.target.value)} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Icon URL"><Input type="url" placeholder="https://..." value={String(form.iconUrl || "")} onChange={(e) => update("iconUrl", e.target.value)} /></Field><Field label="Urutan tampilan"><Input type="number" min="0" step="1" value={String(form.sortOrder || "0")} onChange={(e) => update("sortOrder", e.target.value)} /></Field></div>
          <ActiveField checked={Boolean(form.isActive)} onChange={(value) => update("isActive", value)} />
        </>}

        {tab === "subscriptions" && <>
          <Field label="Tenant"><Select required value={String(form.tenantId || "")} onValueChange={(value) => update("tenantId", value)}><SelectTrigger><SelectValue placeholder="Pilih tenant" /></SelectTrigger><SelectContent>{tenants.map((item) => <SelectItem key={item.id} value={item.id}>{item.companyName}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Plan"><Select required value={String(form.planId || "")} onValueChange={(value) => update("planId", value)}><SelectTrigger><SelectValue placeholder="Pilih plan" /></SelectTrigger><SelectContent>{plans.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} - {item.type === "MONTHLY" ? "Bulanan" : "Tahunan"}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Metode pembayaran"><Select value={String(form.paymentMethodId || "__none__")} onValueChange={(value) => update("paymentMethodId", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Belum ditentukan</SelectItem>{payments.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} - {item.provider}</SelectItem>)}</SelectContent></Select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Tanggal mulai"><Input required type="date" value={String(form.startDate || "")} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="Tanggal berakhir"><Input required type="date" min={String(form.startDate || "")} value={String(form.endDate || "")} onChange={(e) => update("endDate", e.target.value)} /></Field></div>
          <Field label="Status"><Select value={String(form.status || "PENDING")} onValueChange={(value) => update("status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PENDING">Pending</SelectItem><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="EXPIRED">Expired</SelectItem><SelectItem value="CANCELLED">Cancelled</SelectItem></SelectContent></Select></Field>
        </>}

        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function ActiveField({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-blue-600" />Aktif dan dapat digunakan</label>; }
