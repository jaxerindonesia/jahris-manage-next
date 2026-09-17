"use client";

import { useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatDateInputValue } from "@/lib/helper/date";
import type { AttendanceExportPeriod } from "../types";

type ExportPeriodDialogProps = {
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (period: AttendanceExportPeriod) => Promise<void>;
};

export default function ExportPeriodDialog({ loading, onOpenChange, onConfirm }: ExportPeriodDialogProps) {
  const [endDate, setEndDate] = useState(() => formatDateInputValue(new Date()));
  const [startDate, setStartDate] = useState(() => `${formatDateInputValue(new Date()).slice(0, 7)}-01`);
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);

  return (
    <Dialog open onOpenChange={(open) => !loading && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Download Rekap Kehadiran
          </DialogTitle>
          <DialogDescription>
            Pilih rentang tanggal rekap (waktu Jakarta). Filter nama dan status yang aktif tetap diterapkan.
            Untuk rekap satu hari, pilih tanggal mulai dan akhir yang sama.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!loading && startDate && endDate && !invalidRange) void onConfirm({ startDate, endDate });
        }} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="attendance-export-start">Tanggal mulai</Label>
              <Input id="attendance-export-start" type="date" required value={startDate}
                max={endDate || undefined} disabled={loading} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="attendance-export-end">Tanggal akhir</Label>
              <Input id="attendance-export-end" type="date" required value={endDate}
                min={startDate || undefined} disabled={loading} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>
          {invalidRange && <p role="alert" className="text-sm text-red-600 dark:text-red-400">Tanggal akhir harus sama atau setelah tanggal mulai.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading || !startDate || !endDate || invalidRange}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Menyiapkan..." : "Download Excel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
