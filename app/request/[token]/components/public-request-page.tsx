"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  TaskPublicRequestFormDto,
  TaskPublicRequestResultDto,
} from "@/lib/dto/task-public-request";
import { fetchPublicRequestForm } from "../actions";
import { PublicRequestFormData } from "./form-data";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; form: TaskPublicRequestFormDto };

function StatusCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-950">
      {children}
    </div>
  );
}

export function PublicRequestPage({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [result, setResult] = useState<TaskPublicRequestResultDto | null>(null);

  useEffect(() => {
    let active = true;
    fetchPublicRequestForm(token)
      .then((form) => active && setState({ status: "ready", form }))
      .catch((error: Error) => active && setState({ status: "error", message: error.message }));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:py-12">
      {state.status === "ready" && (
        <header className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <div className="h-2 bg-blue-600" />
          <div className="space-y-2 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              {state.form.companyName}
            </p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Form Request Pekerjaan {state.form.departmentName}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Semua permintaan pekerjaan ke divisi {state.form.departmentName} wajib melalui tiket ini.
              Request akan direview terlebih dahulu, dan konfirmasi dikirim ke email Anda.
            </p>
            <p className="text-xs text-red-500">* Wajib diisi</p>
          </div>
        </header>
      )}

      {state.status === "loading" && (
        <StatusCard>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Memuat form...</p>
        </StatusCard>
      )}

      {state.status === "error" && (
        <StatusCard>
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">Form tidak tersedia</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{state.message}</p>
        </StatusCard>
      )}

      {state.status === "ready" && result && (
        <StatusCard>
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-white">Request berhasil dikirim</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Nomor tiket Anda</p>
          <p className="mt-1 font-mono text-2xl font-bold text-blue-600 dark:text-blue-400">
            {result.ticketNumber || "-"}
          </p>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {result.emailSent
              ? "Konfirmasi juga sudah dikirim ke email Anda."
              : "Simpan nomor tiket ini untuk menanyakan perkembangan request Anda."}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => setResult(null)}>
            Kirim request lain
          </Button>
        </StatusCard>
      )}

      {state.status === "ready" && !result && (
        <PublicRequestFormData token={token} options={state.form} onSubmitted={setResult} />
      )}
    </main>
  );
}
