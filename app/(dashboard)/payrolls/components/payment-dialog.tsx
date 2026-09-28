"use client";

import { Check, CircleDollarSign, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PayrollPaymentDialogProps } from "../types";
import styles from "./payment-dialog.module.css";

export default function PaymentDialog({ open, phase, count, onClose, onConfirm }: PayrollPaymentDialogProps) {
  const processing = phase === "processing";
  const success = phase === "success";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !processing) onClose(); }}>
      <DialogContent
        showCloseButton={!processing}
        onInteractOutside={(event) => { if (processing) event.preventDefault(); }}
        className="max-h-[90dvh] overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl dark:bg-slate-900 sm:max-w-md"
      >
        <div className={styles.panel} data-phase={phase}>
          <div className="px-6 pb-6 pt-8 sm:px-8">
            <div className={styles.stage} aria-hidden="true">
              <div className={`${styles.halo} bg-emerald-50 dark:bg-emerald-500/10`} />
              <div className={`${styles.sheetBack} border border-emerald-100 bg-white dark:border-emerald-800 dark:bg-slate-800`} />
              <div className={`${styles.sheet} border border-slate-200 bg-white shadow-xl shadow-emerald-900/10 dark:border-slate-700 dark:bg-slate-800`}>
                <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-3 dark:border-slate-600">
                  <span className="text-[10px] font-bold tracking-[0.15em] text-slate-500 dark:text-slate-400">PAYROLL</span>
                  <CircleDollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className={`${styles.lines} mt-4 space-y-2`}>
                  <div className="h-1.5 w-16 rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-1.5 w-24 rounded bg-slate-100 dark:bg-slate-700" />
                  <div className="h-1.5 w-20 rounded bg-slate-100 dark:bg-slate-700" />
                </div>
                <div className={`${styles.stamp} mt-4 rounded border border-emerald-200 bg-emerald-50 py-1 text-center text-[10px] font-bold tracking-[0.12em] text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300`}>DIBAYAR</div>
                {processing && <div className={styles.scan} />}
              </div>
              {success && (
                <div className={`${styles.seal} bg-emerald-600 text-white ring-4 ring-white dark:ring-slate-900`}>
                  <Check className={styles.check} strokeWidth={3} />
                </div>
              )}
            </div>

            <div className="text-center" aria-live="polite" aria-atomic="true">
              <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {success ? "Status pembayaran tersimpan" : processing ? "Mencatat pembayaran" : "Tandai payroll sebagai Dibayar?"}
              </DialogTitle>
              <DialogDescription className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {success ? `${count} payroll berhasil ditandai Dibayar.` : processing ? `Sedang memperbarui ${count} payroll terpilih. Mohon tunggu sebentar.` : `${count} payroll Pending akan ditandai Dibayar dengan tanggal pembayaran hari ini.`}
              </DialogDescription>
            </div>

            <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>{success ? "Pencatatan selesai" : processing ? "Menyimpan status dan jurnal" : "Jurnal payroll dicatat otomatis"}</span>
                {processing ? <Loader2 className="h-4 w-4 shrink-0 text-emerald-600 motion-safe:animate-spin" /> : success ? <Check className="h-4 w-4 text-emerald-600" /> : null}
              </div>
              {phase !== "confirm" && (
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
                  <div className={`${styles.progress} h-full rounded-full bg-emerald-500`} />
                </div>
              )}
            </div>

            <div className="mt-6 grid min-h-11 grid-cols-2 gap-3">
              {success ? (
                <Button onClick={onClose} className="col-span-2 h-11 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700">Selesai</Button>
              ) : (
                <>
                  <Button variant="outline" disabled={processing} onClick={onClose} className="h-11 rounded-xl">Batal</Button>
                  <Button disabled={processing} onClick={onConfirm} className="h-11 rounded-xl bg-emerald-600 font-semibold text-white shadow-md shadow-emerald-600/15 transition-transform hover:bg-emerald-700 motion-safe:active:scale-[0.97]">
                    {processing ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <CircleDollarSign className="h-4 w-4" />}
                    {processing ? "Memproses..." : `Tandai ${count} Dibayar`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
