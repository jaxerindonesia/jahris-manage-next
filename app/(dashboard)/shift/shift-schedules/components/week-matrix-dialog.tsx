"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BranchDto } from "@/lib/dto/branch";
import type { EmployeeShiftScheduleDto } from "@/lib/dto/work-shift";
import { parseApiError } from "@/lib/helper/response-api";
import { useTenantConfig } from "@/contexts/TenantConfigContext";

export default function WeekMatrixDialog({
  open,
  branches,
  onOpenChange,
}: {
  open: boolean;
  branches: BranchDto[];
  onOpenChange: (open: boolean) => void;
}) {
  const tenantConfig = useTenantConfig();

  const [branchId, setBranchId] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [items, setItems] = useState<EmployeeShiftScheduleDto[]>([]);
  const [loading, setLoading] = useState(false);

  const dates = useMemo(() => {
    if (!weekStart) return [];
    const start = new Date(`${weekStart}T12:00:00`);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return date.toISOString().slice(0, 10);
    });
  }, [weekStart]);

  const employees = useMemo(
    () => [...new Map(items.map((item) => [item.userId, item.user])).entries()],
    [items],
  );

  const load = async () => {
    if (!branchId || dates.length === 0) return toast.error("Pilih cabang dan awal minggu");
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "999999",
        activeEmployeesOnly: "true",
        branchId,
        startDate: dates[0],
        endDate: dates[6],
      });
      const response = await fetch(`/api/shift-schedules?${params}`);
      if (!response.ok) throw new Error(await parseApiError(response, "Gagal memuat kalender shift"));
      const json = await response.json();
      setItems(json.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat kalender shift");
    } finally {
      setLoading(false);
    }
  };

  const printSchedule = () => {
    if (items.length === 0 || dates.length === 0) {
      return toast.error("Tampilkan jadwal terlebih dahulu sebelum mencetak");
    }

    const printWindow = window.open("", "_blank", "width=1400,height=900");
    if (!printWindow) return toast.error("Popup cetak diblokir browser. Izinkan popup lalu coba lagi.");

    const escapeHtml = (value: string) =>
      value.replace(
        /[&<>'"]/g,
        (character) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
          })[character] || character,
      );

    const formatPrintDate = (date: string) =>
      new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

    const companyName = tenantConfig?.companyName || "Perusahaan";
    const branchName = branches.find((item) => item.id === branchId)?.name || "-";
    const logoUrl = tenantConfig?.logoUrl
      ? new URL(tenantConfig.logoUrl, window.location.origin).href
      : "";

    const shiftLegend = [
      ...new Map(
        items.filter((item) => item.shift).map((item) => [item.shiftId, item.shift]),
      ).values(),
    ];

    const colors = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626"];
    const colorByShiftId = new Map(
      shiftLegend.map((shift, index) => [shift?.id, colors[index % colors.length]]),
    );

    const headerCells = dates
      .map(
        (date) =>
          `<th>${escapeHtml(
            new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", {
              weekday: "long",
              day: "2-digit",
              month: "short",
            }),
          )}</th>`,
      )
      .join("");

    const rows = employees
      .map(([userId, user], rowIndex) => {
        const cells = dates
          .map((date) => {
            const schedule = items.find(
              (item) =>
                item.userId === userId &&
                new Date(item.workDate).toISOString().slice(0, 10) === date,
            );

            if (!schedule) return '<td class="empty">—</td>';

            if (schedule.isDayOff) {
              return '<td><div class="schedule day-off"><strong>LIBUR</strong></div></td>';
            }

            const color = colorByShiftId.get(schedule.shiftId ?? undefined) || "#2563eb";

            return `<td>
                <div class="schedule" style="
                  border-color:${color};
                  background:${color}12;
                  color:${color};
                  display:flex;
                  flex-direction:column;
                  justify-content:center;
                  align-items:center;
                  text-align:center;
                ">
                  <strong>${escapeHtml(schedule.shift?.name || "-")}</strong>
                  <small>${escapeHtml(schedule.shift?.startTime || "-")} – ${escapeHtml(
                    schedule.shift?.endTime || "-",
                  )}${schedule.shift?.crossesMidnight ? " (+1)" : ""}</small>
                </div>
              </td>`;
          })
          .join("");

        return `<tr class="${rowIndex % 2 ? "alt" : ""}"><td class="employee"><strong>${escapeHtml(
          user?.name || "-",
        )}</strong><small>${escapeHtml(user?.nik || user?.position || "-")}</small></td>${cells}</tr>`;
      })
      .join("");

    const legend = shiftLegend
      .map(
        (shift, index) =>
          `<div class="legend-item"><i style="background:${colors[index % colors.length]}"></i><span><strong>${escapeHtml(
            shift?.name || "-",
          )}</strong> ${escapeHtml(shift?.startTime || "-")}–${escapeHtml(
            shift?.endTime || "-",
          )}</span></div>`,
      )
      .join("");

    const printedAt = new Date().toLocaleString("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    });

    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Jadwal Shift - ${escapeHtml(
      branchName,
    )}</title><style>
      *{box-sizing:border-box}body{margin:0;background:#fff;color:#172033;font-family:Arial,sans-serif;font-size:10px}.page{padding:7mm 8mm 5mm}.header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:9px}.brand{display:flex;align-items:center;gap:11px}.logo{width:62px;height:44px;object-fit:contain}.logo-fallback{width:44px;height:44px;border-radius:10px;background:#1d4ed8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800}.company{font-size:17px;font-weight:800;margin:0;color:#0f172a}.doc-label{font-size:8px;letter-spacing:1.2px;color:#64748b;text-transform:uppercase;margin-top:3px}.doc-meta{text-align:right}.doc-meta strong{display:block;font-size:15px;color:#1d4ed8}.doc-meta span{display:block;margin-top:3px;font-size:8px;color:#64748b}.info{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:9px 0}.info-card{border:1px solid #dbe3ef;border-radius:6px;padding:6px 8px;background:#f8fafc}.info-card label{display:block;color:#64748b;font-size:7px;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px}.info-card strong{font-size:9px}.legend{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 7px;padding:5px 8px;background:#f8fafc;border-radius:6px}.legend-title{font-weight:700}.legend-item{display:flex;align-items:center;gap:4px}.legend-item i{width:7px;height:7px;border-radius:99px}.legend-item span{font-size:8px}.table-wrap{border:1px solid #94a3b8;border-radius:0;overflow:visible}table{width:100%;border-collapse:collapse;table-layout:fixed;border-radius:0}thead{display:table-header-group;background:#1e3a5f;color:#fff}th{padding:6px 4px;font-size:8px;text-transform:uppercase;letter-spacing:.2px;border-radius:0}th:first-child{width:16%;text-align:left;padding-left:8px}tbody tr{break-inside:avoid;page-break-inside:avoid}td{height:30px;padding:2px 3px;border-top:1px solid #cbd5e1;border-right:1px solid #cbd5e1;text-align:center;vertical-align:middle;border-radius:0}.alt{background:#f8fafc}.employee{text-align:left;padding-left:8px}.employee strong{display:block;font-size:8px;line-height:1.1}.employee small{display:block;color:#64748b;font-size:6px;margin-top:1px}.schedule{display:flex;align-items:center;justify-content:center;gap:3px;border-left:3px solid;border-radius:2px;padding:3px 2px;white-space:nowrap}.schedule strong{font-size:7px}.schedule small{font-size:6px;color:#475569}.day-off{border-color:#94a3b8;background:#f1f5f9;color:#64748b}.empty{color:#94a3b8}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:80px;margin:12px 30px 0;text-align:center;break-inside:avoid;page-break-inside:avoid}.signature p{margin:0 0 25px;color:#475569}.signature div{border-top:1px solid #64748b;padding-top:4px;font-weight:700}.footer{display:flex;justify-content:space-between;margin-top:9px;padding-top:5px;border-top:1px solid #cbd5e1;color:#64748b;font-size:7px;break-inside:avoid}@page{size:A4 landscape;margin:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{page-break-after:auto}}
    </style></head><body><main class="page"><header class="header"><div class="brand">${
      logoUrl
        ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo">`
        : `<div class="logo-fallback">${escapeHtml(companyName.slice(0, 2).toUpperCase())}</div>`
    }<div><h1 class="company">${escapeHtml(
      companyName,
    )}</h1><div class="doc-label">Human Resource Management</div></div></div><div class="doc-meta"><strong>JADWAL SHIFT MINGGUAN</strong><span>Dokumen Operasional Karyawan</span></div></header><section class="info"><div class="info-card"><label>Cabang</label><strong>${escapeHtml(
      branchName,
    )}</strong></div><div class="info-card"><label>Periode</label><strong>${escapeHtml(
      formatPrintDate(dates[0]),
    )} – ${escapeHtml(
      formatPrintDate(dates[6]),
    )}</strong></div><div class="info-card"><label>Total Karyawan</label><strong>${
      employees.length
    } karyawan</strong></div></section><section class="legend"><span class="legend-title">Legenda:</span>${legend}<div class="legend-item"><i style="background:#94a3b8"></i><span><strong>Libur</strong></span></div></section><div class="table-wrap"><table><thead><tr><th>Karyawan</th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div><section class="signatures"><div class="signature"><p>Dibuat oleh,</p><div>Admin / HR</div></div><div class="signature"><p>Disetujui oleh,</p><div>Pimpinan Cabang</div></div></section><footer class="footer"><span>${escapeHtml(
      companyName,
    )} · ${escapeHtml(branchName)}</span><span>Dicetak ${escapeHtml(printedAt)}</span></footer></main></body></html>`);
    printWindow.document.close();

    const doPrint = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };

    if (printWindow.document.readyState === "complete") {
      window.setTimeout(doPrint, 500);
    } else {
      printWindow.onload = () => window.setTimeout(doPrint, 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden sm:max-w-[95vw] xl:max-w-[1600px]">
        <DialogHeader>
          <DialogTitle>Kalender Mingguan Shift</DialogTitle>
        </DialogHeader>

        <div className="grid shrink-0 gap-4 sm:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)_auto_auto]">
          <div className="grid gap-2">
            <Label>Cabang</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih cabang" />
              </SelectTrigger>
              <SelectContent>
                {branches
                  .filter((branch) => branch.scheduleType === "SHIFT")
                  .map((branch) => (
                    <SelectItem key={branch.id} value={branch.id || ""}>
                      {branch.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Awal Minggu</Label>
            <Input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          </div>

          <Button className="self-end" disabled={loading} onClick={load}>
            {loading ? "Memuat..." : "Tampilkan"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="self-end"
            disabled={items.length === 0}
            onClick={printSchedule}
          >
            <Printer className="mr-2 h-4 w-4" />
            Cetak
          </Button>
        </div>

        <div className="min-h-[420px] flex-1 overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="min-w-52">Karyawan</TableHead>
                {dates.map((date) => (
                  <TableHead key={date} className="min-w-40 text-center">
                    {new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    })}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(([userId, user]) => (
                <TableRow key={userId}>
                  <TableCell>
                    <p className="font-medium">{user?.name || "-"}</p>
                    <p className="text-xs text-muted-foreground">
                      {user?.nik || user?.position || "-"}
                    </p>
                  </TableCell>
                  {dates.map((date) => {
                    const schedule = items.find(
                      (item) =>
                        item.userId === userId &&
                        new Date(item.workDate).toISOString().slice(0, 10) === date,
                    );
                    return (
                      <TableCell key={date} className="text-center">
                        {schedule ? (
                          <span
                            className={`shift-badge inline-flex flex-col rounded-lg px-2.5 py-1 text-xs font-medium ${
                              schedule.isDayOff
                                ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}
                          >
                            <strong className="font-medium">
                              {schedule.isDayOff ? "Libur" : schedule.shift?.name}
                            </strong>
                            {!schedule.isDayOff && schedule.shift && (
                              <small className="mt-0.5 text-[10px] font-normal opacity-80">
                                {schedule.shift.startTime}–{schedule.shift.endTime}
                              </small>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-[420px] text-center text-muted-foreground">
                    Pilih cabang dan minggu untuk melihat jadwal.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
