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

export type ExportPeriod =
  | { mode: "month"; month: number; year: number; startDate: string; endDate: string; label: string }
  | { mode: "range"; startDate: string; endDate: string; label: string };

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
  const [mode, setMode] = useState<"month" | "range">("range");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(year, month - 1, 1));
  const effectiveStartDate = mode === "month" ? `${year}-${String(month).padStart(2, "0")}-01` : startDate;
  const effectiveEndDate = mode === "month" ? `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}` : endDate;
  const invalidRange = Boolean(effectiveStartDate && effectiveEndDate && effectiveStartDate > effectiveEndDate);

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
            if (!loading && effectiveStartDate && effectiveEndDate && !invalidRange)
              void onConfirm(mode === "month"
                ? { mode, month, year, startDate: effectiveStartDate, endDate: effectiveEndDate, label: `${monthLabel} ${year}` }
                : { mode, startDate: effectiveStartDate, endDate: effectiveEndDate, label: `${startDate} – ${endDate}` });
          }}
        >
          <div className="flex justify-end">
            <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {([ ["month", "By Bulan"], ["range", "By Range Tanggal"] ] as const).map(([value, label]) => (
                <Button key={value} type="button" size="sm" variant={mode === value ? "outline" : "ghost"} onClick={() => setMode(value)} disabled={loading}>{label}</Button>
              ))}
            </div>
          </div>
          {mode === "month" ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor={`${idPrefix}-month`}>Bulan</Label><select id={`${idPrefix}-month`} className="h-10 rounded-md border bg-background px-3 text-sm" value={month} onChange={(event) => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(2020, index, 1))}</option>)}</select></div>
            <div className="grid gap-2"><Label htmlFor={`${idPrefix}-year`}>Tahun</Label><Input id={`${idPrefix}-year`} type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} /></div>
          </div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>}
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
              disabled={loading || !effectiveStartDate || !effectiveEndDate || invalidRange}
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
