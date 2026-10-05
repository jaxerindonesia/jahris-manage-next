"use client";

import { useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateInputValue } from "@/lib/helper/date";

export type ExportPeriod = { startDate: string; endDate: string };

type ExportPeriodDialogProps = {
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (period: ExportPeriod) => Promise<void>;
  title?: string;
  description?: string;
  submitLabel?: string;
  idPrefix?: string;
};

export default function ExportPeriodDialog({
  loading,
  onOpenChange,
  onConfirm,
  title = "Download Rekap Kehadiran",
  description = "Pilih rentang tanggal rekap (waktu Jakarta). Filter lain yang aktif tetap diterapkan.",
  submitLabel = "Download Excel",
  idPrefix = "export",
}: ExportPeriodDialogProps) {
  const [endDate, setEndDate] = useState(() =>
    formatDateInputValue(new Date()),
  );
  const [startDate, setStartDate] = useState(
    () => `${formatDateInputValue(new Date()).slice(0, 7)}-01`,
  );
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);

  return (
    <Dialog open onOpenChange={(open) => !loading && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading && startDate && endDate && !invalidRange)
              void onConfirm({ startDate, endDate });
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-start`}>Tanggal mulai</Label>
              <Input
                id={`${idPrefix}-start`}
                type="date"
                required
                value={startDate}
                max={endDate || undefined}
                disabled={loading}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-end`}>Tanggal akhir</Label>
              <Input
                id={`${idPrefix}-end`}
                type="date"
                required
                value={endDate}
                min={startDate || undefined}
                disabled={loading}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
          {invalidRange && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Tanggal akhir harus sama atau setelah tanggal mulai.
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={loading || !startDate || !endDate || invalidRange}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Menyiapkan..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
