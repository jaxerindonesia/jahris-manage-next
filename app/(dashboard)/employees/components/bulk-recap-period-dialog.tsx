"use client";

import { useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatDateInputValue } from "@/lib/helper/date";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EMPLOYEE_RECAP_MONTHS } from "@/lib/helper/employee-recap-print";

type BulkRecapPeriodDialogProps = {
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (period: { month: number; year: number } | { startDate: string; endDate: string }) => Promise<void>;
};

export default function BulkRecapPeriodDialog({
  open,
  loading,
  onOpenChange,
  onConfirm,
}: BulkRecapPeriodDialogProps) {
  const currentYear = new Date().getFullYear();
  const [month, setMonth] = useState(() => String(new Date().getMonth() + 1));
  const [year, setYear] = useState(() => String(currentYear));
  const [mode, setMode] = useState<"month" | "range">("month");
  const [startDate, setStartDate] = useState(() => `${formatDateInputValue(new Date()).slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(() => formatDateInputValue(new Date()));
  const invalidRange = !startDate || !endDate || startDate > endDate;
  const years = Array.from({ length: 5 }, (_, index) => currentYear - index);

  const handleConfirm = async () => {
    if (mode === "range") {
      if (!invalidRange) await onConfirm({ startDate, endDate });
      return;
    }
    await onConfirm({ month: Number(month), year: Number(year) });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Pilih Periode Rekap
          </DialogTitle>
          <DialogDescription>
            Pilih bulan atau rentang tanggal untuk seluruh rekap karyawan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button type="button" variant={mode === "month" ? "default" : "outline"} onClick={() => setMode("month")} disabled={loading}>Bulanan</Button>
          <Button type="button" variant={mode === "range" ? "default" : "outline"} onClick={() => setMode("range")} disabled={loading}>Rentang tanggal</Button>
        </div>
        {mode === "month" ? <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="bulk-recap-month">Bulan</Label>
            <Select value={month} onValueChange={setMonth} disabled={loading}>
              <SelectTrigger id="bulk-recap-month" className="w-full">
                <SelectValue placeholder="Pilih bulan" />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYEE_RECAP_MONTHS.map((label, index) => (
                  <SelectItem key={label} value={String(index + 1)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bulk-recap-year">Tahun</Label>
            <Select value={year} onValueChange={setYear} disabled={loading}>
              <SelectTrigger id="bulk-recap-year" className="w-full">
                <SelectValue placeholder="Pilih tahun" />
              </SelectTrigger>
              <SelectContent>
                {years.map((yearOption) => (
                  <SelectItem key={yearOption} value={String(yearOption)}>
                    {yearOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div> : <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="bulk-recap-start">Tanggal mulai</Label>
            <Input id="bulk-recap-start" type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} disabled={loading} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bulk-recap-end">Tanggal akhir</Label>
            <Input id="bulk-recap-end" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} disabled={loading} />
          </div>
          {startDate && endDate && startDate > endDate && <p role="alert" className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">Tanggal akhir harus sama atau setelah tanggal mulai.</p>}
        </div>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={loading || (mode === "range" && invalidRange)}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Menyiapkan..." : "Download PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
