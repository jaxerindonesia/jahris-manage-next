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
import { Textarea } from "@/components/ui/textarea";
import type { BillingCycle, PlanDto } from "@/lib/dto/subscription";

type Props = {
  open: boolean;
  initialData?: PlanDto;
  onClose: () => void;
  onSuccess: () => void;
};

type PlanForm = {
  name: string;
  description: string;
  featureDescription: string;
  featurePermission: string;
  price: string;
  type: BillingCycle;
  isActive: boolean;
};

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

const EMPTY_FORM: PlanForm = {
  name: "",
  description: "",
  featureDescription: "",
  featurePermission: "",
  price: "",
  type: "MONTHLY",
  isActive: true,
};

const splitLines = (value: string) =>
  value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);

export default function PlanFormData({ open, initialData, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: initialData?.name || "",
      description: initialData?.description || "",
      featureDescription: initialData?.featureDescription.join("\n") || "",
      featurePermission: initialData?.featurePermission.join("\n") || "",
      price: initialData?.price?.toString() || "",
      type: initialData?.type || "MONTHLY",
      isActive: initialData?.isActive ?? true,
    });
  }, [initialData, open]);

  const update = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const selectedFeatures = splitLines(form.featurePermission);

  const toggleFeature = (feature: string, checked: boolean) => {
    const next = checked
      ? feature === "*"
        ? ["*"]
        : [...selectedFeatures.filter((item) => item !== "*"), feature]
      : selectedFeatures.filter((item) => item !== feature);
    update("featurePermission", [...new Set(next)].join("\n"));
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await saveManagementRow(
        "plans",
        {
          ...form,
          price: form.price === "" ? null : Number(form.price),
          featureDescription: splitLines(form.featureDescription),
          featurePermission: selectedFeatures,
        },
        initialData?.id,
      );
      toast.success(`Plan berhasil ${initialData ? "diperbarui" : "ditambahkan"}`);
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit" : "Tambah"} Plan</DialogTitle>
          <DialogDescription>Lengkapi data plan, lalu simpan perubahan.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="font-semibold">Informasi Plan</h3>
              <p className="text-sm text-muted-foreground">
                Atur nama, periode, harga, dan informasi yang ditampilkan pada plan.
              </p>
            </div>

            <Field label="Nama plan">
              <Input
                required
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            <Field label="Periode">
              <Select
                value={form.type}
                onValueChange={(value) => update("type", value as BillingCycle)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Bulanan</SelectItem>
                  <SelectItem value="YEARLY">Tahunan</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Deskripsi">
                <Textarea
                  required
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Harga per karyawan (kosongkan untuk Custom Pricing)">
                <Input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(event) => update("price", event.target.value)}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Daftar fitur untuk ditampilkan (satu per baris)">
                <Textarea
                  className="min-h-32"
                  value={form.featureDescription}
                  onChange={(event) => update("featureDescription", event.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <div>
              <h3 className="font-semibold">Hak Akses Fitur</h3>
              <p className="text-sm text-muted-foreground">
                Pilih menu dan fitur yang dapat digunakan oleh pelanggan plan ini.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {PLAN_FEATURES.map((feature) => (
                <label
                  key={feature.value}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes(feature.value)}
                    disabled={feature.value !== "*" && selectedFeatures.includes("*")}
                    onChange={(event) => toggleFeature(feature.value, event.target.checked)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  {feature.label}
                </label>
              ))}
            </div>
          </section>

          <section className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <div>
              <h3 className="font-semibold">Status Plan</h3>
              <p className="text-sm text-muted-foreground">
                Tentukan apakah plan dapat dipilih dan digunakan oleh pelanggan.
              </p>
            </div>

            <Field label="Status Plan">
              <Select
                value={form.isActive ? "ACTIVE" : "INACTIVE"}
                onValueChange={(value) => update("isActive", value === "ACTIVE")}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="INACTIVE">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </section>

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
