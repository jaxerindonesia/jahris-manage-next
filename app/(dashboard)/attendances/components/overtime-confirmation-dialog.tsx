"use client";

import { useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTimeInputValue } from "@/lib/helper/date";
import type { AttendanceOvertimeDto } from "@/lib/dto/attendance-overtime";
import { submitAttendanceOvertime } from "../actions";

export default function OvertimeConfirmationDialog({ suggestion, onClose }: {
  suggestion: AttendanceOvertimeDto;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const hours = Math.floor(suggestion.overtimeMinutes / 60);
  const minutes = suggestion.overtimeMinutes % 60;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !file || !description.trim()) return;
    setLoading(true);
    try {
      const result = await submitAttendanceOvertime(suggestion.attendanceId, description.trim(), file);
      toast.success(result.message || "Pengajuan lembur berhasil dibuat dan menunggu persetujuan");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengajukan lembur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />{confirmed ? "Bukti Lembur" : "Apakah Anda melakukan lembur?"}</DialogTitle>
          <DialogDescription>
            Checkout Anda sudah tercatat. Anda bekerja {hours} jam {minutes > 0 ? `${minutes} menit ` : ""}
            setelah akhir jadwal kerja. Apakah waktu tambahan ini digunakan untuk lembur?
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-slate-50 p-3 text-sm dark:bg-slate-900">
          Waktu lembur: {formatTimeInputValue(suggestion.startTime)}–{formatTimeInputValue(suggestion.endTime)} WIB
        </div>
        {confirmed ? (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="attendance-overtime-description">Keterangan pekerjaan lembur</Label>
              <Textarea id="attendance-overtime-description" required maxLength={2000} disabled={loading}
                value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Jelaskan pekerjaan yang diselesaikan saat lembur..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-overtime-proof">Bukti lembur</Label>
              <Input id="attendance-overtime-proof" type="file" required accept="image/jpeg,image/png,application/pdf" disabled={loading}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  if (selected && (selected.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "application/pdf"].includes(selected.type))) {
                    toast.error("Bukti harus JPG, PNG, atau PDF maksimal 3 MB");
                    event.target.value = "";
                    setFile(null);
                    return;
                  }
                  setFile(selected);
                }} />
              <p className="text-xs text-muted-foreground">JPG, PNG, atau PDF, maksimal 3 MB. Pengajuan akan diteruskan kepada approver lembur.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={loading} onClick={() => setConfirmed(false)}>Kembali</Button>
              <Button type="submit" disabled={loading || !file || !description.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{loading ? "Mengirim..." : "Ajukan Lembur"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Tidak, selesai checkout</Button>
            <Button onClick={() => setConfirmed(true)}>Ya, saya lembur</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
