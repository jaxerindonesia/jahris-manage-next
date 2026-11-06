"use client";

import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import type { ReimbursementReceiptLayout } from "@/app/(dashboard)/reimbursements/types";
import { isPdfUrl } from "@/lib/helper/attachment";

interface ReceiptPreviewCardProps {
  url: string;
  index: number;
  layout: ReimbursementReceiptLayout;
  preview: string | null;
  pageIndex: number;
  pageCount: number;
  loading: boolean;
}

export default function ReceiptPreviewCard({
  url, index, layout, preview, pageIndex, pageCount, loading,
}: ReceiptPreviewCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const isPdf = isPdfUrl(url);
  const label = `${isPdf ? "Dokumen PDF" : "Foto Bukti"} ${index + 1}`;
  const pageLabel = isPdf && preview
    ? ` — Halaman ${pageIndex + 1}${loading ? "" : ` dari ${pageCount}`}`
    : "";

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`Buka ${label.toLowerCase()}`}
      className="photo-card flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      data-attachment-error={imageFailed || (isPdf && !preview && !loading) ? true : undefined}
    >
      <div className="photo-card-header flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}{pageLabel}</span>
        <ExternalLink className="h-3 w-3 text-gray-400" />
      </div>
      <div className="photo-card-body flex flex-1 items-center justify-center p-2">
        {imageFailed ? (
          <p className="rounded-lg bg-gray-100 p-4 text-center text-sm text-gray-400">Gagal memuat {label.toLowerCase()}.</p>
        ) : isPdf && !preview ? (
          <div className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg bg-gray-50 p-4 text-center text-red-600">
            <FileText className="h-10 w-10" />
            <span className="text-sm font-semibold">{label}</span>
            <span className="text-[10px] text-gray-500">
              {loading ? "Memuat halaman PDF..." : "Gagal memuat PDF. Klik untuk membuka dokumen asli."}
            </span>
          </div>
        ) : (
          <img
            src={preview || url}
            alt={`${label}${pageLabel}`}
            className={`mx-auto block h-auto w-auto max-w-full rounded object-contain ${layout === "two" ? "max-h-[300px]" : "max-h-[480px]"}`}
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
    </a>
  );
}
