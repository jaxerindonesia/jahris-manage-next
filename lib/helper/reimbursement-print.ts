import type { ReimbursementReceiptLayout } from "@/app/(dashboard)/reimbursements/types";
import { waitForPrintImages } from "@/lib/helper/print";
import { getReimbursementPrintStyles } from "@/lib/helper/reimbursement-print-styles";

export async function printReimbursement(slip: HTMLElement, layout: ReimbursementReceiptLayout) {
  if (slip.querySelector("[data-attachment-error]")) {
    throw new Error("Lampiran gagal dimuat. Buka ulang slip sebelum mencetak.");
  }

  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) throw new Error("Izinkan pop-up untuk mencetak slip reimbursement.");

  try {
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
      <html><head><title>Bukti Reimbursement</title><meta charset="utf-8" />
      <style>${getReimbursementPrintStyles(layout)}</style></head>
      <body>${slip.outerHTML}</body></html>`);
    printWindow.document.close();

    await waitForPrintImages(printWindow.document.body, 15000);
    if (printWindow.closed) return;
    if (Array.from(printWindow.document.images).some((image) => !image.complete || !image.naturalWidth)) {
      throw new Error("Lampiran belum berhasil dimuat. Silakan coba cetak kembali.");
    }

    printWindow.onafterprint = () => printWindow.close();
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    printWindow.close();
    throw error;
  }
}
