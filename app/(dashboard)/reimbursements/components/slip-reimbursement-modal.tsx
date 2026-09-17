"use client";

import React, { useState } from "react";
import { X, Printer, CheckCircle, Clock, XCircle } from "lucide-react";
import { ReimbursementDto } from "@/lib/dto/reimbursement";
import { formatCurrency } from "@/lib/helper/format-currency";
import { getReimbursementDetails, getReceiptUrls } from "@/lib/helper/reimbursement";
import { formatDateId } from "@/lib/helper/date";

interface SlipReimbursementModalProps {
  open?: boolean;
  detailItem?: ReimbursementDto;
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

export default function SlipReimbursementModal({ open = true, ...props }: SlipReimbursementModalProps) {
  return open ? <SlipReimbursementContent {...props} /> : null;
}

function SlipReimbursementContent({ detailItem, onClose, loading = false }: SlipReimbursementModalProps) {
  const [photoLayout, setPhotoLayout] = useState<"two" | "one">("two");
  const [tenantConfig] = useState<TenantConfig | null>(() => {
    try {
      const raw = localStorage.getItem("hr_user_data");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TenantConfig;
      return {
        companyName: parsed.companyName ?? parsed.tenantName ?? null,
        companyUrl: parsed.companyUrl ?? null,
        logoUrl: parsed.logoUrl ?? parsed.tenantLogoUrl ?? null,
        logoDarkUrl: parsed.logoDarkUrl ?? parsed.tenantLogoDarkUrl ?? null,
      };
    } catch { return null; }
  });

  const handlePrint = () => {
    const slip = document.getElementById("reimburse-print-area");
    if (!slip) { window.print(); return; }

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) { window.print(); return; }

    const isTwoPerPage = photoLayout === "two";
    const maxPhotoHeight = isTwoPerPage ? "125mm" : "200mm";
    const pageMargin = isTwoPerPage ? "8mm 12mm" : "12mm 14mm";
    const groupMargin = isTwoPerPage ? "12px" : "20px";

    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Bukti Reimbursement</title>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: ${pageMargin}; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      color: #1f2937;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ─── Header ─── */
    .slip-header {
      background: linear-gradient(90deg, #1e3a8a 0%, #1d4ed8 100%) !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #fff;
    }
    .slip-header-left { display: flex; align-items: center; gap: 12px; }
    .slip-header-logo { max-height: 40px; max-width: 80px; object-fit: contain; }
    .slip-header-company { font-size: 14pt; font-weight: 700; }
    .slip-header-dept { font-size: 8pt; color: #bfdbfe; }
    .slip-header-right { text-align: right; }
    .slip-header-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.1em; color: #bfdbfe; }
    .slip-header-date { font-size: 12pt; font-weight: 700; }

    /* ─── Info Karyawan ─── */
    .slip-info {
      background: #eff6ff;
      border-bottom: 1px solid #bfdbfe;
      padding: 14px 24px;
    }
    .slip-info-row { display: flex; gap: 16px; margin-bottom: 10px; }
    .slip-info-row:last-child { margin-bottom: 0; }
    .slip-info-col { flex: 1; min-width: 0; }
    .slip-info-col-right { flex: 1; text-align: right; }
    .slip-info-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 2px; }
    .slip-info-value { font-size: 10pt; font-weight: 700; color: #111827; }
    .slip-info-value-sm { font-size: 9pt; font-weight: 600; color: #374151; }

    /* Status badge */
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 8pt; font-weight: 700; }
    .badge-yellow { background: #fef9c3; color: #92400e; }
    .badge-green  { background: #dcfce7; color: #166534; }
    .badge-red    { background: #fee2e2; color: #991b1b; }

    /* ─── Body ─── */
    .slip-body { padding: 16px 24px; }

    /* ─── Table ─── */
    table { width: 100%; border-collapse: collapse; }
    th, td { vertical-align: top; }
    .tbl-detail th { padding: 6px 0; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
    .tbl-detail td { padding: 8px 0; font-size: 9pt; color: #374151; border-bottom: 1px solid #f3f4f6; }
    .tbl-detail td.right, .tbl-detail th.right { text-align: right; }
    .tbl-detail td.bold { font-weight: 600; color: #111827; }

    /* ─── Section title ─── */
    .section-title { font-size: 10pt; font-weight: 700; margin: 14px 0 6px; color: #111827; }

    /* ─── Total box ─── */
    .total-box {
      margin-top: 14px;
      background: linear-gradient(90deg, #1e3a8a 0%, #1d4ed8 100%) !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #fff;
    }
    .total-box-label { font-size: 9pt; color: #bfdbfe; }
    .total-box-sub   { font-size: 7pt; color: #93c5fd; margin-top: 2px; }
    .total-box-amount { font-size: 16pt; font-weight: 700; }

    /* ─── Validasi ─── */
    .validasi { margin: 14px 0 0; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; }
    .validasi-title { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #1d4ed8; margin-bottom: 6px; }
    .validasi p { font-size: 8pt; color: #374151; margin-bottom: 3px; }
    .validasi p:last-child { margin-bottom: 0; }
    .footer-note { margin-top: 14px; text-align: center; font-size: 7pt; color: #9ca3af; }

    /* ─── Lampiran Foto ─── */
    .lampiran-section { padding: ${isTwoPerPage ? "10mm 16px" : "16px 24px"}; page-break-before: always; break-before: page; }
    .lampiran-title { font-size: ${isTwoPerPage ? "11pt" : "13pt"}; font-weight: 700; color: #111827; margin-bottom: 2px; }
    .lampiran-sub { font-size: 7.5pt; color: #6b7280; margin-bottom: ${isTwoPerPage ? "8px" : "16px"}; }

    /* Per expense group */
    .expense-group { margin-bottom: ${groupMargin}; }
    .expense-group-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: ${isTwoPerPage ? "4px 10px" : "6px 12px"};
      margin-bottom: ${isTwoPerPage ? "6px" : "10px"};
    }
    .expense-badge {
      background: #1d4ed8 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color: #fff;
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      border-radius: 4px;
      padding: 2px 7px;
    }
    .expense-date { font-size: 8.5pt; color: #374151; }
    .expense-amount { font-size: 8.5pt; font-weight: 700; color: #111827; margin-left: auto; }

    /* Photo grid: 2 Kolom Kanan-Kiri */
    .photo-grid {
      display: grid !important;
      grid-template-columns: ${isTwoPerPage ? "repeat(2, 1fr)" : "1fr"} !important;
      gap: 10px !important;
      align-items: start !important;
    }

    /* Photo card */
    .photo-card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 0;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      background: #fff;
      display: flex;
      flex-direction: column;
    }
    .photo-card-header {
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      padding: 4px 10px;
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #4b5563;
    }
    .photo-card-body {
      padding: 6px;
      text-align: center;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
    }
    /* Natural aspect ratio, fitted nicely inside 2-column grid */
    .photo-card-body img {
      display: block;
      margin: 0 auto;
      max-width: 100%;
      width: auto;
      height: auto;
      max-height: ${maxPhotoHeight};
      object-fit: contain;
      border-radius: 4px;
    }
    .photo-error { padding: 15px; text-align: center; color: #9ca3af; font-size: 8pt; background: #f9fafb; border-radius: 4px; }
  </style>
</head>
<body>
  ${slip.outerHTML}
</body>
</html>`);
    printWindow.document.close();

    const doPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      } catch { printWindow.close(); }
    };

    if (printWindow.document.readyState === "complete") {
      setTimeout(doPrint, 300);
    } else {
      printWindow.onload = () => setTimeout(doPrint, 300);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-6 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bukti Reimbursement</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Dokumen klaim pengeluaran karyawan</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle 2 Kolom Kanan-Kiri vs 1 Kolom Penuh */}
            <div className="flex items-center rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setPhotoLayout("two")}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  photoLayout === "two"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
                title="2 Foto berdampingan (kanan-kiri) per baris"
              >
                2 Foto Kanan-Kiri
              </button>
              <button
                type="button"
                onClick={() => setPhotoLayout("one")}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  photoLayout === "one"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
                title="1 Foto per baris penuh"
              >
                1 Kolom Penuh
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Printer className="h-4 w-4" />
              Cetak / PDF
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
              {loading ? "Memuat detail reimbursement..." : "Data reimbursement tidak ditemukan."}
            </div>
          ) : (
            <SlipContent reimbursement={detailItem} tenantConfig={tenantConfig} photoLayout={photoLayout} />
          )}
        </div>
      </div>
    </div>
  );
}

function SlipContent({
  reimbursement,
  tenantConfig,
  photoLayout = "two",
}: {
  reimbursement: ReimbursementDto;
  tenantConfig?: TenantConfig | null;
  photoLayout?: "two" | "one";
}) {
  const generatedAtLabel = new Date().toLocaleString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const referenceNumber =
    reimbursement.referenceNumber ||
    (reimbursement.createdAt
      ? `RBM-${new Date(reimbursement.createdAt).getFullYear()}-${String(reimbursement.id || "").slice(0, 8).toUpperCase()}`
      : `RBM-${String(reimbursement.id || "").slice(0, 8).toUpperCase()}`);

  const normalizedStatus = String(reimbursement.status || "").toUpperCase();
  const isApproved = normalizedStatus === "APPROVED";
  const isRejected = normalizedStatus === "REJECTED";
  const departmentLabel =
    typeof reimbursement.user?.department === "string"
      ? reimbursement.user.department
      : reimbursement.user?.department?.name;

  const companyName = tenantConfig?.companyName?.trim() || "JAXER GRUP INDONESIA";
  const companyUrl  = tenantConfig?.companyUrl?.trim() || "";
  const companyLogo =
    tenantConfig?.logoDarkUrl || tenantConfig?.logoUrl ||
    tenantConfig?.tenantLogoDarkUrl || tenantConfig?.tenantLogoUrl || "/logo22.png";

  const statusConfig = isApproved
    ? { label: "Dokumen Disetujui", badgeClass: "badge badge-green", Icon: CheckCircle, tw: "bg-green-100 text-green-700" }
    : isRejected
      ? { label: "Dokumen Ditolak", badgeClass: "badge badge-red", Icon: XCircle, tw: "bg-red-100 text-red-700" }
      : { label: "Menunggu Persetujuan", badgeClass: "badge badge-yellow", Icon: Clock, tw: "bg-yellow-100 text-yellow-700" };

  const { label, Icon, tw } = statusConfig;

  const details = getReimbursementDetails(reimbursement);
  const detailsWithPhotos = details.filter((d) => getReceiptUrls(d).length > 0);

  const approvalDate = new Date(
    isApproved && reimbursement.approvedAt ? reimbursement.approvedAt : reimbursement.date
  ).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  const docDate = new Date(reimbursement.date).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div
      id="reimburse-print-area"
      className="overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800"
      style={{ backgroundColor: "#fff", color: "#1f2937" }}
    >
      {/* ── SLIP-HEADER ── */}
      <div
        className="slip-header px-8 py-6 text-white"
        style={{ background: "linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 100%)" }}
      >
        <div className="slip-header-left flex items-center gap-3">
          <img src={companyLogo} alt={`Logo ${companyName}`} className="slip-header-logo max-h-12 max-w-24 object-contain" />
          <div>
            <div className="slip-header-company text-xl font-bold">{companyName}</div>
            <div className="slip-header-dept text-sm text-blue-200">Human Resources Department</div>
          </div>
        </div>
        <div className="slip-header-right text-right">
          <div className="slip-header-label text-xs font-semibold uppercase tracking-widest text-blue-200">Bukti Reimbursement</div>
          <div className="slip-header-date text-lg font-bold">{docDate}</div>
        </div>
      </div>

      {/* ── INFO KARYAWAN ── */}
      <div className="slip-info border-b border-blue-100 bg-blue-50 px-8 py-5">
        <div className="slip-info-row flex items-start justify-between gap-6">
          <div className="slip-info-col flex-1">
            <div className="slip-info-label mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Nama Karyawan</div>
            <div className="slip-info-value text-base font-bold text-gray-900">{reimbursement.user?.name ?? "-"}</div>
          </div>
          <div className="slip-info-col flex-1">
            <div className="slip-info-label mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Jabatan / Departemen</div>
            <div className="slip-info-value-sm text-base font-semibold text-gray-800">
              {reimbursement.user?.position ?? "-"} / {departmentLabel ?? "-"}
            </div>
          </div>
          <div className="slip-info-col-right flex-1 text-right">
            <span className={`badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tw}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </span>
          </div>
        </div>
        <div className="slip-info-row mt-5 flex items-start justify-between gap-6">
          <div className="slip-info-col flex-1">
            <div className="slip-info-label mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {isApproved && reimbursement.approvedAt ? "Tanggal Disetujui" : "Tanggal Dokumen"}
            </div>
            <div className="slip-info-value-sm text-base font-semibold text-gray-800">{approvalDate}</div>
          </div>
          <div className="slip-info-col flex-1">
            <div className="slip-info-label mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Nomor Referensi</div>
            <div className="slip-info-value-sm text-base font-semibold text-gray-800">{referenceNumber}</div>
          </div>
          <div className="flex-1" />
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="slip-body px-8 py-5">
        {/* Detail klaim */}
        <table className="tbl-detail w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Keterangan</th>
              <th className="right py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="py-3 text-sm text-gray-700">Judul Klaim</td>
              <td className="bold right py-3 text-right text-sm font-medium text-gray-900">{reimbursement.title}</td>
            </tr>
            <tr>
              <td className="py-3 text-sm text-gray-700">Bank Tujuan</td>
              <td className="bold right py-3 text-right text-sm font-medium text-gray-900">{reimbursement.bankName || "-"}</td>
            </tr>
            <tr>
              <td className="py-3 text-sm text-gray-700">No. Rekening</td>
              <td className="bold right py-3 text-right text-sm font-medium text-gray-900">{reimbursement.accountNumber || "-"}</td>
            </tr>
            {reimbursement.description && (
              <tr>
                <td className="py-3 text-sm text-gray-700">Keterangan</td>
                <td className="right py-3 text-right text-sm text-gray-600">{reimbursement.description}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Rincian pengeluaran */}
        <div className="mt-5">
          <h3 className="section-title mb-2 text-sm font-semibold">Rincian Pengeluaran</h3>
          <table className="tbl-detail w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Kategori</th>
                <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tanggal</th>
                <th className="right py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Nominal</th>
              </tr>
            </thead>
            <tbody>
              {details.map((detail, i) => (
                <tr key={detail.id || i} className="border-b border-gray-100">
                  <td className="py-3 pr-3 text-sm">{detail.category}</td>
                  <td className="py-3 pr-3 text-sm">{formatDateId(detail.date)}</td>
                  <td className="bold right py-3 text-right text-sm tabular-nums font-semibold">{formatCurrency(detail.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div
          className="total-box mt-4 rounded-xl p-4"
          style={{ background: "linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 100%)" }}
        >
          <div className="flex items-center justify-between text-white">
            <div>
              <div className="total-box-label text-sm font-medium text-blue-100">Total Pengeluaran</div>
              <div className="total-box-sub mt-0.5 text-xs text-blue-200">Jumlah yang diklaim karyawan</div>
            </div>
            <div className="total-box-amount text-2xl font-semibold">{formatCurrency(reimbursement.amount)}</div>
          </div>
        </div>

        {/* Validasi */}
        <div className="validasi mt-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="validasi-title text-xs font-semibold uppercase tracking-wider text-blue-700">Validasi Dokumen</div>
          <div className="mt-2 grid gap-1 text-sm text-slate-700">
            <p>Dokumen ini valid berdasarkan status reimbursement di sistem: <span className="font-semibold">{label}</span>.</p>
            <p>Waktu slip dibuka/dicetak: <span className="font-semibold">{generatedAtLabel}</span>.</p>
          </div>
        </div>

        <p className="footer-note mt-6 text-center text-xs text-gray-400">
          Dokumen ini dibuat secara otomatis oleh sistem HR {companyName}.
          {companyUrl ? ` Informasi perusahaan: ${companyUrl}.` : ""}
        </p>
      </div>

      {/* ── LAMPIRAN FOTO (halaman baru, foto natural aspect ratio) ── */}
      {detailsWithPhotos.length > 0 && (
        <div
          className="lampiran-section px-8 py-6"
          style={{ pageBreakBefore: "always", breakBefore: "page" }}
        >
          <h2 className="lampiran-title mb-1 text-base font-bold text-gray-900">Lampiran Foto Bukti</h2>
          <p className="lampiran-sub mb-6 text-xs text-gray-500">
            Foto-foto di bawah ini merupakan bukti pengeluaran yang dilampirkan oleh karyawan.
          </p>

          {detailsWithPhotos.map((detail, dIdx) => {
            const urls = getReceiptUrls(detail);
            return (
              <div key={detail.id || dIdx} className="expense-group mb-8">
                {/* Bar info kategori */}
                <div className="expense-group-bar mb-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2">
                  <span
                    className="expense-badge rounded px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                    style={{ background: "#1d4ed8" }}
                  >
                    {detail.category}
                  </span>
                  <span className="expense-date text-sm text-gray-700">{formatDateId(detail.date)}</span>
                  <span className="expense-amount ml-auto text-sm font-semibold text-gray-900">{formatCurrency(detail.amount)}</span>
                </div>

                {/* Foto — 2 kolom (kanan - kiri) berdampingan */}
                <div
                  className={`photo-grid ${
                    photoLayout === "one"
                      ? "grid grid-cols-1 gap-4"
                      : "grid grid-cols-1 gap-3 sm:grid-cols-2"
                  }`}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      photoLayout === "one" ? "1fr" : "repeat(2, minmax(0, 1fr))",
                    gap: "12px",
                  }}
                >
                  {urls.map((url, fIdx) => (
                    <div
                      key={`${url}-${fIdx}`}
                      className="photo-card overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col"
                      style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
                    >
                      <div className="photo-card-header border-b border-gray-100 bg-gray-50 px-3 py-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Foto Bukti {fIdx + 1}
                        </span>
                      </div>
                      <div className="photo-card-body p-2 flex items-center justify-center flex-1">
                        <img
                          src={url}
                          alt={`Bukti ${dIdx + 1} - Foto ${fIdx + 1}`}
                          className="mx-auto block"
                          style={{
                            maxWidth: "100%",
                            width: "auto",
                            height: "auto",
                            maxHeight: photoLayout === "two" ? "300px" : "480px",
                            objectFit: "contain",
                            borderRadius: "4px",
                            display: "block",
                          }}
                          onError={(e) => {
                            const t = e.currentTarget as HTMLImageElement;
                            const wrapper = t.parentElement;
                            if (wrapper) {
                              wrapper.innerHTML = `<div class="photo-error flex h-20 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">Gagal memuat foto bukti ${fIdx + 1}</div>`;
                            }
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
