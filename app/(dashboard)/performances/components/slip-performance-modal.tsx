"use client";

import { useMemo } from "react";
import { useTenantConfig } from "@/contexts/TenantConfigContext";
import {
  AlertCircle,
  BriefcaseBusiness,
  Printer,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { PerformanceDto } from "@/lib/dto/performance";

interface SlipPerformanceModalProps {
  open?: boolean;
  detailItem?: PerformanceDto;
  onClose: () => void;
  loading?: boolean;
}

type TenantConfig = {
  companyName?: string | null;
  companyUrl?: string | null;
  logoUrl?: string | null;
  logoDarkUrl?: string | null;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  tenantLogoDarkUrl?: string | null;
};

function getScoreLabel(score: number) {
  if (score >= 5) return "Sangat Baik";
  if (score >= 4) return "Baik";
  if (score >= 3) return "Cukup";
  if (score >= 2) return "Kurang";
  if (score >= 1) return "Sangat Kurang";
  return "Belum Dinilai";
}

function getScoreTone(score: number) {
  if (score >= 4.5) return "bg-emerald-100 text-emerald-700";
  if (score >= 3.5) return "bg-blue-100 text-blue-700";
  if (score >= 2.5) return "bg-amber-100 text-amber-700";
  if (score > 0) return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

export default function SlipPerformanceModal({
  open = false,
  detailItem,
  onClose,
  loading = false,
}: SlipPerformanceModalProps) {
  const tenantConfig = useTenantConfig();

  const handlePrint = () => {
    const slip = document.getElementById("performance-print-area");
    if (!slip) {
      window.print();
      return;
    }

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      window.print();
      return;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join("");

    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Slip Penilaian Kinerja</title>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          ${styles}
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
            }
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #performance-print-area {
              width: 190mm !important;
              max-width: 190mm !important;
              margin: 0 auto !important;
              box-sizing: border-box !important;
              transform: scale(0.84) !important;
              transform-origin: top center !important;
              width: 211mm !important;
              max-width: 211mm !important;
            }
            #performance-print-area * {
              page-break-inside: avoid !important;
            }
          </style>
        </head>
        <body style="margin:0;padding:0;background:#fff;">
          ${slip.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();

    const doPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      } catch {
        printWindow.close();
      }
    };

    if (printWindow.document.readyState === "complete") {
      setTimeout(doPrint, 250);
    } else {
      printWindow.onload = () => setTimeout(doPrint, 250);
    }
  };

  if (!open) return null;

  return (
    <div className="no-print fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b p-6 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Slip Penilaian Kinerja</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Ringkasan hasil KPI otomatis karyawan
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Printer className="h-4 w-4" />
              Cetak / Download PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-all hover:rotate-90 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {!detailItem || loading ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {loading ? "Memuat slip penilaian..." : "Data penilaian tidak ditemukan."}
            </div>
          ) : (
            <SlipContent detailItem={detailItem} tenantConfig={tenantConfig} />
          )}
        </div>
      </div>
    </div>
  );
}

function SlipContent({
  detailItem,
  tenantConfig,
}: {
  detailItem: PerformanceDto;
  tenantConfig?: TenantConfig | null;
}) {
  const companyName = tenantConfig?.companyName?.trim() || "JAXER GRUP INDONESIA";
  const companyUrl = tenantConfig?.companyUrl?.trim() || "";
  const companyLogo =
    tenantConfig?.logoDarkUrl ||
    tenantConfig?.logoUrl ||
    tenantConfig?.tenantLogoDarkUrl ||
    tenantConfig?.tenantLogoUrl ||
    "/logo22.png";
  const generatedAtLabel = new Date().toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const referenceNumber =
    detailItem.id && detailItem.createdAt
      ? `PRF-${new Date(detailItem.createdAt).getFullYear()}-${String(detailItem.id).slice(0, 8).toUpperCase()}`
      : `PRF-${String(detailItem.id || "").slice(0, 8).toUpperCase()}`;

  const scoreCards = [
    {
      label: "Produktivitas",
      value: detailItem.productivity,
      icon: Sparkles,
    },
    {
      label: "Kualitas",
      value: detailItem.quality,
      icon: ShieldCheck,
    },
    {
      label: "Kerjasama",
      value: detailItem.teamwork,
      icon: Users,
    },
    {
      label: "Disiplin",
      value: detailItem.discipline,
      icon: BriefcaseBusiness,
    },
  ];

  const hasSufficientData = detailItem.kpiBreakdown?.hasSufficientData;

  const scoreSummary = useMemo(
    () => getScoreLabel(Math.round(Number(detailItem.totalScore || 0))),
    [detailItem.totalScore],
  );

  return (
    <div
      id="performance-print-area"
      className="overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800"
      style={{ backgroundColor: "#fff", color: "#1f2937" }}
    >
      <div
        className="px-7 py-5 text-white"
        style={{ background: "linear-gradient(90deg, #1e3a8a 0%, #2563eb 100%)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 items-center overflow-hidden">
              <img
                src={companyLogo}
                alt={`Logo ${companyName}`}
                className="max-h-12 max-w-24 object-contain"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wide">{companyName}</h1>
              <p className="text-sm text-blue-200">Human Resources Department</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">
              Slip Penilaian Kinerja
            </p>
            <p className="text-base font-bold">{detailItem.period || "-"}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-blue-100 bg-blue-50 px-7 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Nama Karyawan
            </p>
            <p className="text-sm font-bold text-gray-900">{detailItem.user?.name ?? "-"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Jabatan / Departemen
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {detailItem.user?.position ?? "-"} / {detailItem.user?.department?.name ?? "-"}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Nomor Referensi
            </p>
            <p className="text-sm font-semibold text-gray-800">{referenceNumber}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Total Score
            </p>
            <div className="flex items-center gap-3">
              <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getScoreTone(Number(detailItem.totalScore || 0))}`}>
                {scoreSummary}
              </span>
              <span className="text-lg font-bold text-gray-900">
                {Number(detailItem.totalScore || 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-7 py-5">
        <div className="grid grid-cols-2 gap-3">
          {scoreCards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-3.5"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-500">{item.label}</p>
                    <p className="mt-1.5 text-3xl font-bold text-gray-900">{item.value}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-2.5 text-gray-700">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getScoreTone(item.value)}`}>
                  {getScoreLabel(item.value)}
                </span>
              </div>
            );
          })}
        </div>

        {!hasSufficientData && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Belum cukup data</p>
              <p className="mt-1">
                Periode ini belum memiliki data yang cukup untuk pembacaan KPI yang komprehensif.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Sumber KPI Kehadiran
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: "Total data hadir", value: detailItem.kpiBreakdown?.attendanceCount || 0 },
                { label: "Hadir", value: detailItem.kpiBreakdown?.presentCount || 0 },
                { label: "Terlambat", value: detailItem.kpiBreakdown?.lateCount || 0 },
                { label: "Absent", value: detailItem.kpiBreakdown?.absentCount || 0 },
                { label: "Auto checkout", value: detailItem.kpiBreakdown?.autoCheckoutCount || 0 },
                { label: "Pengajuan approved", value: detailItem.kpiBreakdown?.approvedSubmissionCount || 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500">
                    {item.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Sumber KPI Tugas & Lembur
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: "Task assigned", value: detailItem.kpiBreakdown?.assignedTaskCount || 0 },
                { label: "Task selesai", value: detailItem.kpiBreakdown?.completedTaskCount || 0 },
                { label: "Task overdue", value: detailItem.kpiBreakdown?.overdueTaskCount || 0 },
                { label: "Task kolaboratif", value: detailItem.kpiBreakdown?.collaborativeTaskCount || 0 },
                { label: "Lembur approved", value: detailItem.kpiBreakdown?.approvedOvertimeCount || 0 },
                { label: "Nominal lembur", value: `Rp ${Number(detailItem.kpiBreakdown?.approvedOvertimeAmount || 0).toLocaleString("id-ID")}`, wide: true },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 ${item.wide ? "col-span-2" : ""}`}
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500">
                    {item.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">Catatan Evaluasi</p>
          <p className="mt-1.5 text-sm leading-5 text-gray-600">
            {detailItem.notes?.trim() || "Tidak ada catatan tambahan."}
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            Validasi Dokumen
          </p>
          <p className="mt-1.5 text-sm leading-5 text-slate-700">
            Dokumen ini dibuat otomatis oleh sistem HR untuk periode <b>{detailItem.period || "-"}</b> dan merekam hasil penilaian KPI berdasarkan data aktivitas yang tersedia.
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-700">
            Dievaluasi oleh: <b>{detailItem.evaluatedBy || "-"}</b>
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-700">
            Waktu generate dokumen: <b>{generatedAtLabel}</b>
          </p>
        </div>

        <div className="px-2 pt-4 text-center text-[11px] text-gray-400">
          Dokumen ini dibuat secara otomatis oleh sistem HR {companyName}.
          {companyUrl ? ` ${companyUrl}` : ""}
        </div>
      </div>
    </div>
  );
}
