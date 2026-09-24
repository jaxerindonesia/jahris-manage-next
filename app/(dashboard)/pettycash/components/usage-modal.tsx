"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PettyCashDto } from "@/lib/dto/petty-cash";

export default function PettyCashUsageModal({
  isOpen,
  pettyCashId,
  pettyCash,
  canManage = false,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  pettyCashId: string;
  pettyCash?: PettyCashDto;
  canManage?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [usageDate, setUsageDate] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [transactionType, setTransactionType] = useState<"EXPENSE" | "TOP_UP" | "RETURN">("EXPENSE");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incomingFiles = Array.from(e.target.files ?? []);
    if (!incomingFiles.length) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (selectedFiles.length + incomingFiles.length > 5) {
      toast.error("Maksimal 5 bukti untuk setiap transaksi");
      return;
    }
    for (const file of incomingFiles) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name}: ukuran file maksimal 5MB`);
        return;
      }
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: format file tidak didukung`);
        return;
      }
    }
    setSelectedFiles((current) => [...current, ...incomingFiles.map((file) => ({
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "pdf",
    }))]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((current) => {
      const target = current[index];
      if (target?.previewUrl !== "pdf") URL.revokeObjectURL(target.previewUrl);
      return current.filter((_, fileIndex) => fileIndex !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || !usageDate) {
      toast.error("Semua field wajib diisi");
      return;
    }

    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("description", description);
      fd.append("amount", String(amount));
      fd.append("usageDate", usageDate);
      fd.append("transactionType", transactionType);
      selectedFiles.forEach(({ file }) => fd.append("files", file));

      const res = await fetch(`/api/pettycash/${pettyCashId}/usage`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Gagal melaporkan penggunaan");
      }

      toast.success("Transaksi petty cash berhasil dicatat!");
      onSuccess();
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const transactionCopy = transactionType === "TOP_UP"
    ? { amount: "Nominal Tambahan Dana (Rp)", date: "Tanggal Transfer Finance", proof: "Bukti Transfer Finance", submit: "Catat Tambahan Dana" }
    : transactionType === "RETURN"
      ? { amount: "Nominal Pengembalian (Rp)", date: "Tanggal Pengembalian", proof: "Bukti Transfer Pengembalian", submit: "Catat Pengembalian" }
      : { amount: "Nominal Pengeluaran (Rp)", date: "Tanggal Digunakan", proof: "Bukti Pengeluaran (Nota / Struk)", submit: "Kirim Laporan" };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Catat Transaksi Petty Cash</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Jenis Transaksi</Label>
            <Select value={transactionType} onValueChange={(value) => setTransactionType(value as typeof transactionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">Pengeluaran (Kredit)</SelectItem>
                {canManage ? <SelectItem value="TOP_UP">Tambahan dana Finance (Debit)</SelectItem> : null}
                <SelectItem value="RETURN">Pengembalian sisa dana (Kredit)</SelectItem>
              </SelectContent>
            </Select>
            {pettyCash ? (
              <p className="text-xs text-muted-foreground">
                Saldo saat ini: Rp {(pettyCash.amount + (pettyCash.usages ?? []).reduce((sum, row) =>
                  sum + (row.transactionType === "TOP_UP" ? row.amount : -row.amount), 0)).toLocaleString("id-ID")}
              </p>
            ) : null}
          </div>
          {/* Digunakan Untuk Apa */}
          <div className="space-y-2">
            <Label htmlFor="description">Keterangan Transaksi</Label>
            <Textarea
              id="description"
              placeholder="Jelaskan detail penggunaan dana..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Nominal */}
          <div className="space-y-2">
            <Label htmlFor="amount">{transactionCopy.amount}</Label>
            <Input
              id="amount"
              type="text"
              placeholder="0"
              value={amount ? amount.toLocaleString("id-ID") : ""}
              onChange={(e) => {
                const numericValue = e.target.value.replace(/\D/g, "");
                setAmount(Number(numericValue));
              }}
              required
            />
          </div>

          {/* Tanggal Digunakan */}
          <div className="space-y-2">
            <Label htmlFor="usageDate">{transactionCopy.date}</Label>
            <Input
              id="usageDate"
              type="date"
              value={usageDate}
              onChange={(e) => setUsageDate(e.target.value)}
              required
            />
          </div>

          {/* Bukti Pengeluaran */}
          <div className="space-y-2">
            <Label>{transactionCopy.proof}</Label>
            {selectedFiles.length < 5 ? (
              <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 text-center hover:bg-gray-50/50">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-xs text-gray-500">
                  Pilih hingga 5 file · JPG, PNG, WebP, PDF (Maks. 5MB/file)
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            ) : null}
            {selectedFiles.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {selectedFiles.map(({ file, previewUrl }, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} className="overflow-hidden rounded-lg border bg-gray-50">
                    {previewUrl === "pdf" ? (
                      <div className="flex h-24 flex-col items-center justify-center gap-1 p-2 text-center"><FileText className="h-6 w-6 text-red-500" /><span className="max-w-full truncate text-xs">{file.name}</span></div>
                    ) : (
                      <img src={previewUrl} alt={`Bukti ${index + 1}`} className="h-24 w-full object-contain p-1" />
                    )}
                    <button type="button" onClick={() => removeFile(index)} className="w-full border-t py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">Hapus</button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Batal
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? "Mengirim..." : transactionCopy.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
