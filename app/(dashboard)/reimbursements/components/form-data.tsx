"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import EmployeeSearchSelect from "@/components/employee-search-select";
import type { ReimbursementDto } from "@/lib/dto/reimbursement";
import { formatDateInputValue } from "@/lib/helper/date";
import { formatCurrency } from "@/lib/helper/format-currency";
import { getReimbursementDetails, getReceiptUrls } from "@/lib/helper/reimbursement";
import { saveReimbursement } from "../actions";
import type { ReimbursementDetailForm, ReimbursementForm } from "../types";
import ExpenseRow from "./expense-row";

function emptyDetail(): ReimbursementDetailForm {
  return { key: `${Date.now()}-${Math.random()}`, category: "", amount: 0, date: "", receiptUrls: [], files: [] };
}

export default function ReimbursementFormData({ isOpen, initialData, onClose, onSuccess }: {
  isOpen: boolean;
  initialData?: ReimbursementDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  if (!isOpen) return null;
  return <ReimbursementFormContent initialData={initialData} onClose={onClose} onSuccess={onSuccess} />;
}

function ReimbursementFormContent({ initialData, onClose, onSuccess }: {
  initialData?: ReimbursementDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [user] = useState<{ id?: string; role?: string }>(() => {
    try { return JSON.parse(localStorage.getItem("hr_user_data") || "{}"); }
    catch { return {}; }
  });
  const isEmployee = user.role?.toLowerCase().replace(/\s/g, "") === "karyawan";
  const [form, setForm] = useState<ReimbursementForm>(() => ({
    id: initialData?.id,
    userId: initialData?.userId || (isEmployee ? user.id || "" : ""),
    title: initialData?.title || "",
    bankName: initialData?.bankName || "",
    accountNumber: initialData?.accountNumber || "",
    description: initialData?.description || "",
    details: initialData ? getReimbursementDetails(initialData).map((detail, index) => ({
      ...detail, key: detail.id || `existing-${index}`, date: formatDateInputValue(detail.date), receiptUrls: getReceiptUrls(detail), files: [],
    })) : [emptyDetail()],
  }));
  const total = Math.round(form.details.reduce((sum, detail) => sum + detail.amount, 0) * 100) / 100;
  const updateDetail = (key: string, changes: Partial<ReimbursementDetailForm>) => {
    setForm((current) => ({ ...current, details: current.details.map((detail) => detail.key === key ? { ...detail, ...changes } : detail) }));
  };
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.userId) return toast.error("Pilih karyawan terlebih dahulu");
    if (form.details.some((detail) => !detail.category || !detail.date || detail.amount <= 0)) {
      return toast.error("Lengkapi kategori, nominal, dan tanggal pada setiap rincian");
    }
    setLoading(true);
    try {
      await saveReimbursement(form);
      toast.success(`Reimbursement berhasil ${form.id ? "diupdate" : "disimpan"}!`);
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan reimbursement");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto p-4 sm:max-w-4xl sm:p-6" showCloseButton={!loading}>
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit Reimbursement" : "Tambah Reimbursement"}</DialogTitle>
          <DialogDescription>Lengkapi informasi klaim dan rincian pengeluaran yang ingin diajukan.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="min-w-0">
          <fieldset disabled={loading} className="grid min-w-0 gap-5">
            {!isEmployee && (
              <div className="grid gap-2">
                <Label>Nama Karyawan</Label>
                <EmployeeSearchSelect value={form.userId} onChange={(userId) => setForm({ ...form, userId })} placeholder="Pilih Karyawan" />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="claim-title">Judul Klaim</Label>
              <Input id="claim-title" placeholder="Contoh: Biaya Perjalanan Dinas Jakarta" value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="claim-bank">Bank Tujuan</Label>
                <Input id="claim-bank" placeholder="Contoh: BCA" value={form.bankName}
                  onChange={(event) => setForm({ ...form, bankName: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="claim-account">No. Rekening</Label>
                <Input id="claim-account" placeholder="Contoh: 1234567890" value={form.accountNumber} inputMode="numeric"
                  onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="claim-description">Keterangan (opsional)</Label>
              <Textarea id="claim-description" placeholder="Deskripsikan klaim reimbursement Anda secara singkat" rows={3}
                value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </div>
            <section className="grid min-w-0 gap-3 border-t pt-5" aria-labelledby="expense-heading">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 id="expense-heading" className="font-semibold">Rincian Pengeluaran</h3>
                  <p className="text-sm text-muted-foreground">Tambahkan satu rincian untuk setiap pengeluaran.</p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={loading || form.details.length >= 50}
                  onClick={() => setForm((current) => ({ ...current, details: [...current.details, emptyDetail()] }))}>
                  <Plus className="h-4 w-4" /> Tambah Rincian
                </Button>
              </div>
              {form.details.map((detail, index) => (
                <ExpenseRow key={detail.key} detail={detail} index={index} disabled={loading}
                  canRemove={form.details.length > 1} onChange={(changes) => updateDetail(detail.key, changes)}
                  onRemove={() => setForm((current) => ({ ...current, details: current.details.filter((row) => row.key !== detail.key) }))} />
              ))}
            </section>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 p-4" aria-live="polite">
              <div><p className="font-semibold">Total Pengeluaran</p><p className="text-sm text-muted-foreground">{form.details.length} rincian pengeluaran</p></div>
              <p className="text-xl font-bold tabular-nums">{formatCurrency(total)}</p>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
              <Button type="submit">{loading ? "Menyimpan..." : form.id ? "Update" : "Simpan"}</Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
