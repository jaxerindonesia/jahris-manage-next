"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X, Printer, CheckCircle, Clock, XCircle } from "lucide-react";
import type { ReimbursementDto } from "@/lib/dto/reimbursement";
import { formatCurrency } from "@/lib/helper/format-currency";
import { getReimbursementDetails, getReceiptUrls } from "@/lib/helper/reimbursement";
import { formatDateId } from "@/lib/helper/date";
import { useTenantConfig, type TenantConfig } from "@/contexts/TenantConfigContext";
import { Button } from "@/components/ui/button";
import { usePdfReceipts } from "./use-pdf-receipts";
import ReceiptPreviewCard from "./receipt-preview-card";
import type { ReimbursementReceiptLayout } from "@/app/(dashboard)/reimbursements/types";
import { printReimbursement } from "@/lib/helper/reimbursement-print";

interface SlipReimbursementModalProps {
  open?: boolean;
  detailItem?: ReimbursementDto;
  onClose: () => void;
  loading?: boolean;
}

export default function SlipReimbursementModal({ open = true, ...props }: SlipReimbursementModalProps) {
  return open ? <SlipReimbursementContent {...props} /> : null;
}

function SlipReimbursementContent({ detailItem, onClose, loading = false }: SlipReimbursementModalProps) {
  const [photoLayout, setPhotoLayout] = useState<ReimbursementReceiptLayout>("two");
  const tenantConfig = useTenantConfig();
  const pdfReceipts = usePdfReceipts(detailItem);

  const handlePrint = async () => {
    if (loading || pdfReceipts.loading || pdfReceipts.failed) return;
    const slip = document.getElementById("reimburse-print-area");
    if (!slip) return;

    try {
      await printReimbursement(slip, photoLayout);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mencetak slip reimbursement");
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPhotoLayout("two")}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  photoLayout === "two"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
                title="2 Foto berdampingan (kanan-kiri) per baris"
              >
                2 Foto Kanan-Kiri
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPhotoLayout("one")}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  photoLayout === "one"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
                title="1 Foto per baris penuh"
              >
                1 Kolom Penuh
              </Button>
            </div>

            <Button
              onClick={handlePrint}
              disabled={loading || !detailItem || pdfReceipts.loading || pdfReceipts.failed}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Printer className="h-4 w-4" />
              {pdfReceipts.loading ? "Memuat PDF..." : "Cetak / PDF"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Tutup slip reimbursement"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-all hover:rotate-90 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="p-6">
          {pdfReceipts.failed && (
            <div role="alert" className="mb-4 flex items-center gap-3 text-sm text-red-600">
              <p>Lampiran PDF gagal dimuat. {pdfReceipts.error}</p>
              <Button variant="outline" size="sm" onClick={pdfReceipts.retry}>Coba lagi</Button>
            </div>
          )}
          {!detailItem || loading ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {loading ? "Memuat detail reimbursement..." : "Data reimbursement tidak ditemukan."}
            </div>
          ) : (
            <SlipContent
              reimbursement={detailItem}
              tenantConfig={tenantConfig}
              photoLayout={photoLayout}
              pdfPages={pdfReceipts.pages}
              pdfLoading={pdfReceipts.loading}
            />
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
  pdfPages,
  pdfLoading,
}: {
  reimbursement: ReimbursementDto;
  tenantConfig?: TenantConfig | null;
  photoLayout?: ReimbursementReceiptLayout;
  pdfPages: Record<string, string[]>;
  pdfLoading: boolean;
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
  const companyLogo = tenantConfig?.logoDarkUrl?.trim();

  const statusConfig = isApproved
    ? { label: "Dokumen Disetujui", badgeClass: "badge badge-green", Icon: CheckCircle, tw: "bg-green-100 text-green-700" }
    : isRejected
      ? { label: "Dokumen Ditolak", badgeClass: "badge badge-red", Icon: XCircle, tw: "bg-red-100 text-red-700" }
      : { label: "Menunggu Persetujuan", badgeClass: "badge badge-yellow", Icon: Clock, tw: "bg-yellow-100 text-yellow-700" };

  const { label, badgeClass, Icon, tw } = statusConfig;

  const details = getReimbursementDetails(reimbursement);
  const detailsWithReceipts = details.filter((d) => getReceiptUrls(d).length > 0);

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
        className="slip-header flex items-center justify-between gap-6 px-8 py-5 text-white"
        style={{ background: "linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 100%)" }}
      >
        <div className="slip-header-left flex items-center gap-3.5">
          {companyLogo && (
            <img
              src={companyLogo}
              alt={`Logo ${companyName}`}
              className="slip-header-logo block h-11 w-[92px] shrink-0 object-contain object-center"
            />
          )}
          <div className={`slip-header-identity flex min-h-[42px] flex-col justify-center ${companyLogo ? "has-logo border-l border-white/30 pl-3.5" : ""}`}>
            <div className="slip-header-company text-xl leading-none font-bold">{companyName}</div>
            <div className="slip-header-dept mt-1 text-sm leading-none text-blue-200">Human Resources Department</div>
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
            <span className={`${badgeClass} inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tw}`}>
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
                <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Keterangan</th>
                <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tanggal</th>
                <th className="right py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Nominal</th>
              </tr>
            </thead>
            <tbody>
              {details.map((detail, i) => (
                <tr key={detail.id || i} className="border-b border-gray-100">
                  <td className="py-3 pr-3 text-sm">{detail.category}</td>
                  <td className="py-3 pr-3 text-sm text-gray-600">{detail.description || "-"}</td>
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
        </p>
      </div>

      {/* ── LAMPIRAN BUKTI (halaman baru, foto natural aspect ratio) ── */}
      {detailsWithReceipts.length > 0 && (
        <div
          className="lampiran-section px-8 py-6"
          style={{ pageBreakBefore: "always", breakBefore: "page" }}
        >
          <h2 className="lampiran-title mb-1 text-base font-bold text-gray-900">Lampiran Bukti</h2>
          <p className="lampiran-sub mb-6 text-xs text-gray-500">
            Foto atau dokumen PDF di bawah ini merupakan bukti pengeluaran yang dilampirkan oleh karyawan.
          </p>

          {detailsWithReceipts.map((detail, dIdx) => {
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

                <div
                  className={`photo-grid ${
                    photoLayout === "one"
                      ? "grid grid-cols-1 gap-4"
                      : "grid grid-cols-1 gap-3 sm:grid-cols-2"
                  }`}
                >
                  {urls.flatMap((url, index) => {
                    const pages = pdfPages[url];
                    return (pages?.length ? pages : [null]).map((preview, pageIndex) => (
                      <ReceiptPreviewCard
                        key={`${url}-${index}-${pageIndex}`}
                        url={url}
                        index={index}
                        layout={photoLayout}
                        preview={preview}
                        pageIndex={pageIndex}
                        pageCount={pages?.length ?? 0}
                        loading={pdfLoading}
                      />
                    ));
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
