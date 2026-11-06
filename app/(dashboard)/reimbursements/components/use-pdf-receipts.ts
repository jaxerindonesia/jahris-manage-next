"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReimbursementDto } from "@/lib/dto/reimbursement";
import { isPdfUrl } from "@/lib/helper/attachment";
import { getReceiptUrls, getReimbursementDetails } from "@/lib/helper/reimbursement";
import { renderPdfPages } from "@/lib/helper/pdf-preview";

const PDF_LOAD_TIMEOUT_MS = 60_000;

export function usePdfReceipts(reimbursement?: ReimbursementDto) {
  const urls = useMemo(() => reimbursement
    ? [...new Set(getReimbursementDetails(reimbursement).flatMap(getReceiptUrls).filter(isPdfUrl))]
    : [], [reimbursement]);
  const key = JSON.stringify([reimbursement?.id, urls]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    pages: Record<string, string[]>;
    loading: boolean;
    attempt: number;
    error?: string;
  }>();

  useEffect(() => {
    if (!urls.length) return;
    const controller = new AbortController();
    const pages: Record<string, string[]> = {};
    async function load() {
      let error: string | undefined;
      for (const url of urls) {
        // Bound worker startup, download and rendering so a stalled task can be retried.
        const timeoutController = new AbortController();
        const signal = AbortSignal.any([controller.signal, timeoutController.signal]);
        const timeout = setTimeout(() => {
          timeoutController.abort(new Error("PDF terlalu lama dimuat. Silakan coba lagi."));
        }, PDF_LOAD_TIMEOUT_MS);
        let stopListening: (() => void) | undefined;
        try {
          const source = reimbursement?.id
            ? `/api/reimbursements/${encodeURIComponent(reimbursement.id)}?receiptUrl=${encodeURIComponent(url)}`
            : url;
          const aborted = new Promise<never>((_, reject) => {
            const onAbort = () => reject(signal.reason);
            signal.addEventListener("abort", onAbort, { once: true });
            stopListening = () => signal.removeEventListener("abort", onAbort);
          });
          pages[url] = await Promise.race([
            renderPdfPages(source, signal, (images) => {
              if (signal.aborted) return;
              pages[url] = images;
              setResult({ key, attempt, pages: { ...pages }, error, loading: true });
            }),
            aborted,
          ]);
        } catch (cause) {
          if (controller.signal.aborted) return;
          error = cause instanceof Error ? cause.message : "Gagal memuat lampiran PDF";
        } finally {
          clearTimeout(timeout);
          stopListening?.();
        }
      }
      if (!controller.signal.aborted) setResult({ key, attempt, pages, loading: false, error });
    }
    void load();
    return () => controller.abort();
  }, [key, urls, reimbursement?.id, attempt]);

  const current = result?.key === key && result.attempt === attempt ? result : undefined;
  return {
    pages: current?.pages ?? {},
    loading: urls.length > 0 && (!current || current.loading),
    failed: Boolean(current?.error),
    error: current?.error,
    retry: () => setAttempt((value) => value + 1),
  };
}
