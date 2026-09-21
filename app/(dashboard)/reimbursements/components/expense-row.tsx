"use client";

import { ExternalLink, FileText, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumberInput } from "@/lib/helper/date";
import { REIMBURSEMENT_CATEGORIES } from "@/lib/helper/reimbursement";
import type { ReimbursementDetailForm } from "../types";

export default function ExpenseRow({ detail, index, disabled, canRemove, onChange, onRemove }: {
  detail: ReimbursementDetailForm;
  index: number;
  disabled: boolean;
  canRemove: boolean;
  onChange: (changes: Partial<ReimbursementDetailForm>) => void;
  onRemove: () => void;
}) {
  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    for (const file of files) {
      if (!file.size || file.size > 5 * 1024 * 1024) return toast.error("Ukuran bukti maksimal 5 MB dan tidak boleh kosong");
      if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
        return toast.error("Bukti harus berupa JPG, PNG, WebP, atau PDF");
      }
    }
    onChange({ files: [...detail.files, ...files] });
  };
  const prefix = `expense-${detail.key}`;
  return (
    <div className="min-w-0 rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Rincian {index + 1}</p>
        {canRemove && (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} className="text-destructive" aria-label={`Hapus rincian ${index + 1}`}>
                <Trash2 className="h-4 w-4" /> Hapus
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-3">
              <p className="text-sm">Hapus rincian pengeluaran ini dari klaim?</p>
              <Button type="button" variant="destructive" size="sm" onClick={onRemove}>Hapus Rincian</Button>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-category`}>Kategori</Label>
          <Select value={detail.category} onValueChange={(category) => onChange({ category })} disabled={disabled} required>
            <SelectTrigger id={`${prefix}-category`} className="w-full"><SelectValue placeholder="Pilih Kategori" /></SelectTrigger>
            <SelectContent>{REIMBURSEMENT_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-amount`}>Nominal (Rp)</Label>
          <Input id={`${prefix}-amount`} inputMode="numeric" placeholder="0" value={formatNumberInput(detail.amount)} required
            onChange={(event) => onChange({ amount: Number(event.target.value.replace(/\D/g, "")) })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-date`}>Tanggal Pengeluaran</Label>
          <Input id={`${prefix}-date`} type="date" value={detail.date} required onChange={(event) => onChange({ date: event.target.value })} />
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <Label htmlFor={`${prefix}-receipt`}>Bukti Pengeluaran</Label>
        <Input
          id={`${prefix}-receipt`}
          type="file"
          multiple
          disabled={disabled}
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleFile}
          className="sr-only"
        />
        <Label
          htmlFor={`${prefix}-receipt`}
          className={`flex min-h-16 w-full items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-3 transition-colors ${
            disabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:border-primary hover:bg-primary/5"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm">
            <Upload className="h-5 w-5 text-primary" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">Pilih file bukti pengeluaran</span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Tekan area ini untuk memilih satu atau beberapa file
            </span>
          </span>
        </Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {detail.receiptUrls.map((url, fileIndex) => (
            <div key={url} className="flex min-w-0 items-center gap-2 rounded-lg border p-2">
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
                Bukti {fileIndex + 1} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
              <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Hapus bukti tersimpan ${fileIndex + 1} rincian ${index + 1}`}
                onClick={() => onChange({ receiptUrls: detail.receiptUrls.filter((_, i) => i !== fileIndex) })}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {detail.files.map((file, fileIndex) => (
            <div key={fileIndex} className="flex min-w-0 items-center gap-2 rounded-lg border p-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 break-all text-sm">{file.name}</span>
              <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Hapus foto baru ${fileIndex + 1} rincian ${index + 1}`}
                onClick={() => onChange({ files: detail.files.filter((_, i) => i !== fileIndex) })}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Bisa pilih beberapa foto sekaligus atau tambahkan lagi. JPG, PNG, WebP, atau PDF, maksimal 5 MB per file.</p>
      </div>
    </div>
  );
}
