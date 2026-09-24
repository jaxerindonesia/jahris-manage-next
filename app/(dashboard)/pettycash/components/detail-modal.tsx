"use client";

import { ExternalLink, Receipt, Wallet, CheckCircle, Calendar, Printer, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/helper/format-currency";
import { PettyCashDto } from "@/lib/dto/petty-cash";
import { STATUS_COLOR, STATUS_LABEL } from "../page.config";

type PettyCashDetailModalProps = {
  open: boolean;
  onClose: () => void;
  detailItem?: PettyCashDto;
  loading?: boolean;
};

export default function PettyCashDetailModal({
  open,
  onClose,
  detailItem,
  loading = false,
}: PettyCashDetailModalProps) {
  const totalUsed = detailItem?.usages?.filter((usage) => usage.transactionType !== "TOP_UP" && usage.transactionType !== "RETURN").reduce((sum, usage) => sum + usage.amount, 0) || 0;
  const totalTopUp = detailItem?.usages?.filter((usage) => usage.transactionType === "TOP_UP").reduce((sum, usage) => sum + usage.amount, 0) || 0;
  const totalReturn = detailItem?.usages?.filter((usage) => usage.transactionType === "RETURN").reduce((sum, usage) => sum + usage.amount, 0) || 0;
  const remainingBalance = (detailItem?.amount || 0) + totalTopUp - totalUsed - totalReturn;
  const evidenceGroups = (detailItem?.usages ?? []).map((usage) => ({
    usage,
    urls: usage.receiptUrls?.length ? usage.receiptUrls : usage.receiptUrl ? [usage.receiptUrl] : [],
  })).filter((group) => group.urls.length > 0);

  const handlePrint = () => {
    const content = document.getElementById("petty-cash-print-area");
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) return window.print();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Laporan Petty Cash</title><style>
      @page{size:A4 portrait;margin:10mm 12mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#1f2937;font-size:9pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-shell{padding:0}button{display:none!important}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.rounded-xl{border-radius:7px}.border{border:1px solid #dbe3ef}.p-4{padding:10px}.space-y-6>*+*{margin-top:14px}.space-y-3>*+*{margin-top:8px}.text-xs{font-size:7.5pt}.font-semibold,.font-medium{font-weight:700}.text-red-600{color:#dc2626}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{border-bottom:1px solid #dbe3ef;padding:6px;text-align:left}th{text-transform:uppercase;font-size:7pt;background:#eaf2ff}.text-right{text-align:right}.print-title{display:block!important;font-size:17pt;font-weight:700;color:#0f172a;border-bottom:3px solid #2563eb;padding:0 0 9px;margin:0 0 13px}a{color:inherit;text-decoration:none}.receipt-section{break-before:page;page-break-before:always;border-top:0!important;padding-top:0!important}.receipt-section-title{font-size:15pt!important;color:#0f172a;margin:0}.receipt-section-subtitle{margin:3px 0 12px}.receipt-group{margin:0 0 10px}.receipt-group-header{display:flex;align-items:center;justify-content:space-between;padding:6px 9px;background:#eaf2ff;border:1px solid #bfdbfe;border-radius:6px;font-size:8pt}.receipt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:7px}.receipt-card{height:86mm;break-inside:avoid;page-break-inside:avoid;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;background:#fff;display:flex;flex-direction:column}.receipt-card img{display:block;width:100%;height:76mm;max-height:76mm;object-fit:contain;padding:4px}.receipt-card-pdf{height:76mm!important}.receipt-card-footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding:5px 8px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:7pt}.receipt-card-footer svg{display:none}.screen-evidence-note{display:none}
    </style></head><body><div class="print-shell"><div class="print-title">Laporan Petty Cash</div>${content.innerHTML}</div></body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); printWindow.onafterprint = () => printWindow.close(); };
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[94vh] w-[50vw] overflow-y-auto p-4 md:p-6 sm:!max-w-[100rem]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle>Detail Petty Cash</DialogTitle>
            <Button type="button" size="sm" onClick={handlePrint} disabled={!detailItem || loading}>
              <Printer className="mr-2 h-4 w-4" /> Cetak / PDF
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Memuat detail petty cash...
          </div>
        ) : !detailItem ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Data petty cash tidak ditemukan.
          </div>
        ) : (
          <div id="petty-cash-print-area" className="space-y-6 pt-3">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <Wallet className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-500">Pemberian Dana</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(detailItem.amount)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <Receipt className="h-8 w-8 text-indigo-600" />
                <div>
                  <p className="text-xs text-gray-500">Total Digunakan</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(totalUsed)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <CheckCircle className={`h-8 w-8 ${remainingBalance < 0 ? "text-red-600" : "text-green-600"}`} />
                <div>
                  <p className="text-xs text-gray-500">Sisa Saldo</p>
                  <p className={`font-semibold ${remainingBalance < 0 ? "text-red-600" : "text-gray-900 dark:text-white"}`}>
                    {formatCurrency(remainingBalance)}
                  </p>
                </div>
              </div>
            </div>

            {remainingBalance < 0 ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Dana kurang {formatCurrency(Math.abs(remainingBalance))}. Laporkan kekurangan ini ke Finance; Finance dapat mencatatnya sebagai <b>Tambahan dana (Debit)</b> melalui transaksi.
              </div>
            ) : remainingBalance > 0 && detailItem.status === "TRANSFER" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Sisa {formatCurrency(remainingBalance)} dapat ditransfer kembali oleh karyawan dan dicatat sebagai <b>Pengembalian sisa dana (Kredit)</b>.
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 border-b pb-4 md:grid-cols-2">
              <MetaItem label="Karyawan Penerima" value={detailItem.user?.name ?? "-"} />
              <MetaItem label="Tujuan" value={detailItem.purpose || "-"} />
              <MetaItem label="Kategori" value={detailItem.category || "-"} />
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[detailItem.status] ?? ""}`}
                >
                  {STATUS_LABEL[detailItem.status] ?? detailItem.status}
                </span>
              </div>
              <MetaItem
                label="Bank Tujuan"
                value={`${detailItem.bankName || "-"} - ${detailItem.accountNumber || "-"}`}
              />
              <MetaItem
                label="Tanggal Ditransfer"
                value={
                  detailItem.transferDate
                    ? new Date(detailItem.transferDate).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "Belum ditransfer"
                }
              />
            </div>

            <div className="space-y-3">
              <h4 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                <Receipt className="h-5 w-5 text-gray-500" />
                Mutasi Debit / Kredit
              </h4>

              {detailItem.usages ? (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-blue-50 text-xs uppercase text-gray-600"><tr><th className="p-3 text-left">Tanggal / Keterangan</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Kredit</th><th className="p-3 text-right">Bukti</th></tr></thead>
                    <tbody>
                      <tr className="border-t"><td className="p-3"><b>Transfer dana awal</b><div className="text-xs text-gray-500">{detailItem.transferDate ? new Date(detailItem.transferDate).toLocaleDateString("id-ID") : "-"}</div></td><td className="p-3 text-right font-semibold">{formatCurrency(detailItem.amount)}</td><td className="p-3 text-right">-</td><td className="p-3 text-right">-</td></tr>
                      {detailItem.usages.map((usage) => {
                        const isDebit = usage.transactionType === "TOP_UP";
                        const receiptUrls = usage.receiptUrls?.length ? usage.receiptUrls : usage.receiptUrl ? [usage.receiptUrl] : [];
                        return <tr key={usage.id} className="border-t"><td className="p-3"><b>{usage.description}</b><div className="flex items-center gap-1 text-xs text-gray-500"><Calendar className="h-3 w-3" />{new Date(usage.usageDate).toLocaleDateString("id-ID")}</div></td><td className="p-3 text-right font-semibold">{isDebit ? formatCurrency(usage.amount) : "-"}</td><td className="p-3 text-right font-semibold">{!isDebit ? formatCurrency(usage.amount) : "-"}</td><td className="p-3 text-right">{receiptUrls.length ? `${receiptUrls.length} bukti` : "-"}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Belum ada penggunaan dana yang dilaporkan.
                </div>
              )}
            </div>

            {evidenceGroups.length > 0 ? (
              <div className="receipt-section space-y-4 border-t pt-5">
                <div>
                  <h4 className="receipt-section-title font-semibold text-gray-900 dark:text-white">Lampiran Bukti Transaksi</h4>
                  <p className="receipt-section-subtitle screen-evidence-note text-xs text-gray-500">Foto ditampilkan langsung dan ikut disertakan saat dokumen dicetak.</p>
                </div>
                {evidenceGroups.map(({ usage, urls }) => (
                  <div key={usage.id} className="receipt-group space-y-2">
                    <div className="receipt-group-header flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800">
                      <span className="font-medium">{usage.description}</span>
                      <span>{formatCurrency(usage.amount)}</span>
                    </div>
                    <div className="receipt-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {urls.map((url, index) => {
                        const isPdf = /\.pdf(?:$|\?)/i.test(url);
                        return (
                          <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="receipt-card overflow-hidden rounded-xl border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            {isPdf ? (
                              <div className="receipt-card-pdf flex min-h-32 flex-col items-center justify-center gap-2 p-5 text-blue-600"><FileText className="h-10 w-10" /><span className="text-sm font-medium">Dokumen PDF {index + 1}</span></div>
                            ) : (
                              <img src={url} alt={`Bukti ${usage.description} ${index + 1}`} className="max-h-80 w-full object-contain p-2" />
                            )}
                            <div className="receipt-card-footer flex items-center justify-between border-t bg-gray-50 px-3 py-2 text-xs dark:bg-gray-900">
                              <span>Bukti {index + 1}</span><ExternalLink className="h-3.5 w-3.5" />
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
