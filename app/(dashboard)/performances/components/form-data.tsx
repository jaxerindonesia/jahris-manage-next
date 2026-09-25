import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { PerformanceDto } from "@/lib/dto/performance";
import { toast } from "sonner";
import { parseApiError } from "@/lib/helper/response-api";
import { months } from "@/lib/helper/date";
import { formatCurrency } from "@/lib/helper/format-currency";
import EmployeeSearchSelect from "@/components/employee-search-select";
import {
  AlertCircle,
  BriefcaseBusiness,
  CircleHelp,
  Gauge,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

type KpiPreview = NonNullable<PerformanceDto["kpiBreakdown"]> & {
  productivity: number;
  quality: number;
  teamwork: number;
  discipline: number;
  totalScore: number;
  period: string;
};

const createDefaultFormData = (): PerformanceDto => ({
  userId: "",
  period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
  productivity: 0,
  quality: 0,
  teamwork: 0,
  discipline: 0,
  notes: "",
  totalScore: 0,
  evaluatedBy: "",
});

function parsePeriod(period?: string | null) {
  const matched = String(period || "").match(/^(\d{4})-(\d{2})$/);
  if (!matched) {
    return {
      month: String(new Date().getMonth() + 1),
      year: String(new Date().getFullYear()),
    };
  }

  return {
    year: matched[1],
    month: String(Number(matched[2])),
  };
}

function getScoreTone(score: number) {
  if (score >= 4.5) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300";
  }
  if (score >= 3.5) {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300";
  }
  if (score >= 2.5) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300";
  }
  if (score > 0) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300";
  }
  return "border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";
}

function getScoreLabel(score: number) {
  if (score >= 5) return "Sangat Baik";
  if (score >= 4) return "Baik";
  if (score >= 3) return "Cukup";
  if (score >= 2) return "Kurang";
  if (score >= 1) return "Sangat Kurang";
  return "Belum Dinilai";
}

function getKpiInfoContent(
  label: string,
  score: number,
  breakdown?: KpiPreview | null,
) {
  if (!breakdown?.hasSufficientData) {
    return {
      title: label,
      description:
        "Belum ada cukup data pada periode ini, jadi sistem belum bisa menjelaskan sumber skor KPI.",
      bullets: [] as string[],
    };
  }

  if (label === "Produktivitas") {
    return {
      title: label,
      description: `Skor ${score} dihitung dari rasio task selesai dan dukungan aktivitas lembur yang disetujui.`,
      bullets: [
        `Task assigned: ${breakdown.assignedTaskCount}`,
        `Task selesai: ${breakdown.completedTaskCount}`,
        `Lembur approved: ${breakdown.approvedOvertimeCount}`,
        "Semakin banyak task selesai dibanding total tugas, skor makin tinggi.",
      ],
    };
  }

  if (label === "Kualitas") {
    return {
      title: label,
      description: `Skor ${score} dihitung dari ketepatan penyelesaian task terhadap due date.`,
      bullets: [
        `Task selesai: ${breakdown.completedTaskCount}`,
        `Task overdue: ${breakdown.overdueTaskCount}`,
        "Semakin banyak task selesai tepat waktu, skor kualitas makin tinggi.",
      ],
    };
  }

  if (label === "Kerjasama") {
    return {
      title: label,
      description: `Skor ${score} dihitung dari keterlibatan user di task kolaboratif.`,
      bullets: [
        `Task assigned: ${breakdown.assignedTaskCount}`,
        `Task kolaboratif: ${breakdown.collaborativeTaskCount}`,
        "Semakin besar porsi tugas bersama tim, skor kerjasama makin tinggi.",
      ],
    };
  }

  return {
    title: label,
    description: `Skor ${score} dihitung dari konsistensi kehadiran dan kepatuhan absensi selama periode ini.`,
    bullets: [
      `Total data hadir: ${breakdown.attendanceCount}`,
      `Hadir: ${breakdown.presentCount}`,
      `Terlambat: ${breakdown.lateCount}`,
      `Absent: ${breakdown.absentCount}`,
      `Auto checkout: ${breakdown.autoCheckoutCount}`,
      "Semakin sedikit keterlambatan, absent, dan auto checkout, skor disiplin makin tinggi.",
    ],
  };
}

export default function FormData({
  initialData,
  onClose,
  onSuccess,
}: {
  initialData?: PerformanceDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [kpiPreview, setKpiPreview] = useState<KpiPreview | null>(null);
  const [formData, setFormData] = useState<PerformanceDto>(
    initialData || createDefaultFormData(),
  );
  const [periodState, setPeriodState] = useState(() => parsePeriod(initialData?.period));

  const currentPeriod = useMemo(
    () => `${periodState.year}-${String(Number(periodState.month || 1)).padStart(2, "0")}`,
    [periodState.month, periodState.year],
  );

  const fetchKpiPreview = async (params: { userId: string; period: string }) => {
    if (!params.userId || !params.period) {
      setKpiPreview(null);
      setFormData((current) => ({
        ...current,
        period: params.period,
        productivity: 0,
        quality: 0,
        teamwork: 0,
        discipline: 0,
        totalScore: 0,
      }));
      return;
    }

    try {
      setPreviewLoading(true);
      const searchParams = new URLSearchParams(params);
      const res = await fetch(`/api/performances/preview?${searchParams.toString()}`);
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil preview KPI"),
        );
      }

      const json = await res.json();
      const preview = json.data as {
        productivity: number;
        quality: number;
        teamwork: number;
        discipline: number;
        totalScore: number;
        period: string;
        kpiBreakdown: NonNullable<PerformanceDto["kpiBreakdown"]>;
      };

      setKpiPreview({
        ...preview.kpiBreakdown,
        productivity: preview.productivity,
        quality: preview.quality,
        teamwork: preview.teamwork,
        discipline: preview.discipline,
        totalScore: preview.totalScore,
        period: preview.period,
      });
      setFormData((current) => ({
        ...current,
        period: preview.period,
        productivity: preview.productivity,
        quality: preview.quality,
        teamwork: preview.teamwork,
        discipline: preview.discipline,
        totalScore: preview.totalScore,
      }));
    } catch (error) {
      setKpiPreview(null);
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat preview KPI",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.userId) {
      toast.error("Karyawan wajib dipilih");
      setLoading(false);
      return;
    }

    if (!currentPeriod) {
      toast.error("Periode wajib diisi");
      setLoading(false);
      return;
    }

    if (!kpiPreview) {
      toast.error("Preview KPI belum tersedia");
      setLoading(false);
      return;
    }

    if (!kpiPreview.hasSufficientData) {
      toast.error("Belum cukup data untuk membuat KPI otomatis pada periode ini");
      setLoading(false);
      return;
    }

    const currentUser = JSON.parse(localStorage.getItem("hr_user_data") || "null");
    const payload: PerformanceDto = {
      ...formData,
      period: currentPeriod,
      productivity: kpiPreview.productivity,
      quality: kpiPreview.quality,
      teamwork: kpiPreview.teamwork,
      discipline: kpiPreview.discipline,
      totalScore: kpiPreview.totalScore,
      evaluatedBy: currentUser?.name || "",
    };

    try {
      const url = payload.id ? `/api/performances/${payload.id}` : "/api/performances";
      const method = payload.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await parseApiError(res, "Gagal menyimpan data"));

      toast.success(
        `Data penilaian berhasil ${payload.id ? "diupdate" : "disimpan"}!`,
      );
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Terjadi kesalahan",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFormData((current) => ({
      ...current,
      period: currentPeriod,
    }));
  }, [currentPeriod]);

  useEffect(() => {
    fetchKpiPreview({
      userId: formData.userId,
      period: currentPeriod,
    });
  }, [formData.userId, currentPeriod]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] !w-[calc(100vw-4rem)] !max-w-[1100px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {formData.id
              ? "Edit Penilaian Kinerja"
              : "Tambah Penilaian Kinerja"}
          </DialogTitle>
          <DialogDescription>
            Skor KPI dibuat otomatis dari kehadiran, tugas, pengajuan yang disetujui, dan lembur pada periode terpilih.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="dark:text-gray-300">Nama Karyawan</Label>
              <EmployeeSearchSelect
                value={formData.userId || ""}
                onChange={(value) =>
                  setFormData({ ...formData, userId: value })
                }
                placeholder="Pilih Karyawan"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label className="dark:text-gray-300">Bulan</Label>
                <Select
                  value={periodState.month}
                  onValueChange={(value) =>
                    setPeriodState((current) => ({
                      ...current,
                      month: value,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih Bulan" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month.value} value={String(month.value)}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="year" className="dark:text-gray-300">
                  Tahun
                </Label>
                <Input
                  id="year"
                  inputMode="numeric"
                  value={periodState.year}
                  onChange={(e) =>
                    setPeriodState((current) => ({
                      ...current,
                      year: e.target.value.replace(/\D/g, "").slice(0, 4),
                    }))
                  }
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  required
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/70 p-5 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
              <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-blue-600 p-3 text-white dark:bg-blue-500">
                    <Gauge className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      Preview KPI Otomatis
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                      Tinjau hasil perhitungan KPI yang dihasilkan secara otomatis berdasarkan aktivitas dan pencapaian selama periode penilaian.
                    </p>
                  </div>
                </div>

                <div
                  className={`min-w-[148px] rounded-[20px] border px-4 py-3 text-right ${kpiPreview?.hasSufficientData
                      ? getScoreTone(Number(kpiPreview?.totalScore || 0))
                      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                    Total Score
                  </p>
                  <p className="mt-2 text-[42px] font-semibold leading-none">
                    {previewLoading
                      ? "..."
                      : kpiPreview?.hasSufficientData
                        ? Number(kpiPreview?.totalScore || 0).toFixed(2)
                        : "-"}
                  </p>
                  <p className="mt-2 text-[11px] font-medium">
                    {previewLoading
                      ? "Memuat..."
                      : getScoreLabel(Math.round(Number(kpiPreview?.totalScore || 0)))}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
                {[
                  {
                    label: "Produktivitas",
                    value: kpiPreview?.productivity || 0,
                    icon: Sparkles,
                  },
                  {
                    label: "Kualitas",
                    value: kpiPreview?.quality || 0,
                    icon: ShieldCheck,
                  },
                  {
                    label: "Kerjasama",
                    value: kpiPreview?.teamwork || 0,
                    icon: Users,
                  },
                  {
                    label: "Disiplin",
                    value: kpiPreview?.discipline || 0,
                    icon: BriefcaseBusiness,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const info = getKpiInfoContent(item.label, item.value, kpiPreview);
                  return (
                    <div
                      key={item.label}
                      className={`rounded-[24px] border p-4 ${kpiPreview?.hasSufficientData
                          ? getScoreTone(item.value)
                          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            {item.label}
                          </p>
                          <p className="mt-3 text-4xl font-semibold leading-none text-slate-900 dark:text-slate-100">
                            {previewLoading
                              ? "..."
                              : kpiPreview?.hasSufficientData
                                ? item.value
                                : "-"}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/80 text-slate-500 transition-colors hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400 dark:hover:text-slate-100"
                                aria-label={`Info ${item.label}`}
                              >
                                <CircleHelp className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="end"
                              className="w-80 rounded-2xl border bg-white p-4 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            >
                              <div className="space-y-3">
                                <div>
                                  <p className="font-semibold">{info.title}</p>
                                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                    {info.description}
                                  </p>
                                </div>
                                {info.bullets.length > 0 && (
                                  <div className="space-y-2">
                                    {info.bullets.map((bullet) => (
                                      <div
                                        key={bullet}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                                      >
                                        {bullet}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <div className="rounded-2xl bg-white/80 p-2.5 dark:bg-slate-950/50">
                            <Icon className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 text-xs font-medium">
                        {previewLoading
                          ? "Memuat..."
                          : kpiPreview?.hasSufficientData
                            ? getScoreLabel(item.value)
                            : "Belum ada data"}
                      </p>
                    </div>
                  );
                })}
              </div>

              {!previewLoading && kpiPreview && !kpiPreview.hasSufficientData && (
                <div className="mt-4 flex items-start gap-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Belum cukup data</p>
                    <p className="mt-1 leading-6">
                      KPI otomatis baru bisa dihitung jika sudah ada minimal data kehadiran, tugas, pengajuan approved, atau lembur approved pada periode ini.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-100 p-2.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        Sumber KPI Kehadiran
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Basis penilaian disiplin dan konsistensi kehadiran.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Total data hadir", value: kpiPreview?.attendanceCount || 0 },
                      { label: "Hadir", value: kpiPreview?.presentCount || 0 },
                      { label: "Terlambat", value: kpiPreview?.lateCount || 0 },
                      { label: "Absent", value: kpiPreview?.absentCount || 0 },
                      { label: "Auto checkout", value: kpiPreview?.autoCheckoutCount || 0 },
                      { label: "Pengajuan approved", value: kpiPreview?.approvedSubmissionCount || 0 },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60"
                      >
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          {item.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-100 p-2.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        Sumber KPI Tugas & Lembur
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Basis produktivitas, kolaborasi, dan kontribusi kerja tambahan.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Task assigned", value: kpiPreview?.assignedTaskCount || 0 },
                      { label: "Task selesai", value: kpiPreview?.completedTaskCount || 0 },
                      { label: "Task overdue", value: kpiPreview?.overdueTaskCount || 0 },
                      { label: "Task kolaboratif", value: kpiPreview?.collaborativeTaskCount || 0 },
                      { label: "Lembur approved", value: kpiPreview?.approvedOvertimeCount || 0 },
                      { label: "Nominal lembur", value: formatCurrency(kpiPreview?.approvedOvertimeAmount || 0), wide: true },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60 ${item.wide ? "col-span-2" : ""
                          }`}
                      >
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          {item.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Ringkasan Perhitungan
                </p>
                <p className="mt-1 leading-6">
                  {kpiPreview?.hasSufficientData
                    ? "Rumus saat ini memprioritaskan disiplin dan produktivitas, lalu mempertimbangkan kualitas hasil kerja serta kolaborasi."
                    : "Sistem tidak menghitung skor jika seluruh sumber data KPI pada periode ini masih kosong."}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes" className="dark:text-gray-300">
                Catatan
              </Label>
              <Textarea
                id="notes"
                placeholder="Catatan tambahan tentang kinerja"
                value={formData.notes ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="min-h-[120px] dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>

            <Button
              type="submit"
              disabled={loading || previewLoading || !kpiPreview?.hasSufficientData}
            >
              {loading ? "Menyimpan..." : formData.id ? "Update" : "Simpan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
