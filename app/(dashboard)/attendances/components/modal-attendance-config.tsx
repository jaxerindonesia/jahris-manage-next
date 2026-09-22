"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseApiError } from "@/lib/helper/response-api";

interface AttendanceConfig {
  officeStartTime: string;
  officeEndTime: string;
  lateToleranceMinutes: number;
  lateDeductionAmount: number;
  absentDeductionByDay: Record<string, number>;
  overtimeThresholdHours: number;
  breakEnabled: boolean;
  breakFaceCaptureEnabled: boolean;
  workingDays: string[];
}

const DAY_LABELS = [
  ["MONDAY", "Senin"], ["TUESDAY", "Selasa"], ["WEDNESDAY", "Rabu"],
  ["THURSDAY", "Kamis"], ["FRIDAY", "Jumat"], ["SATURDAY", "Sabtu"], ["SUNDAY", "Minggu"],
] as const;
const EMPTY_ABSENT_DEDUCTIONS = Object.fromEntries(DAY_LABELS.map(([day]) => [day, 0]));

const defaultConfig: AttendanceConfig = {
  officeStartTime: "09:00",
  officeEndTime: "17:00",
  lateToleranceMinutes: 15,
  lateDeductionAmount: 0,
  absentDeductionByDay: EMPTY_ABSENT_DEDUCTIONS,
  overtimeThresholdHours: 2,
  breakEnabled: false,
  breakFaceCaptureEnabled: false,
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
};

export default function ModalAttendanceConfig({
  isOpen,
  onClose,
  onSaved,
  initialConfig,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  initialConfig?: AttendanceConfig;
}) {
  const [form, setForm] = useState<AttendanceConfig>(defaultConfig);
  const [loading, setLoading] = useState(false);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/attendance-config");
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal memuat konfigurasi attendance"),
        );
      }
      const json = await res.json();
      const data = json.data || defaultConfig;
      setForm({
        overtimeThresholdHours: Number(data.overtimeThresholdHours ?? 2),
        officeStartTime: data.officeStartTime || defaultConfig.officeStartTime,
        officeEndTime: data.officeEndTime || defaultConfig.officeEndTime,
        lateToleranceMinutes: Number(
          data.lateToleranceMinutes ?? defaultConfig.lateToleranceMinutes,
        ),
        lateDeductionAmount: Number(
          data.lateDeductionAmount ?? defaultConfig.lateDeductionAmount,
        ),
        absentDeductionByDay: { ...EMPTY_ABSENT_DEDUCTIONS, ...data.absentDeductionByDay },
        breakEnabled: Boolean(data.breakEnabled ?? defaultConfig.breakEnabled),
        breakFaceCaptureEnabled: Boolean(
          data.breakFaceCaptureEnabled ?? defaultConfig.breakFaceCaptureEnabled,
        ),
        workingDays:
          Array.isArray(data.workingDays) && data.workingDays.length > 0
            ? data.workingDays
            : defaultConfig.workingDays,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal memuat konfigurasi attendance",
      );
    }
  };

  useEffect(() => {
    if (initialConfig) {
      setForm({ ...initialConfig, absentDeductionByDay: { ...EMPTY_ABSENT_DEDUCTIONS, ...initialConfig.absentDeductionByDay } });
      return;
    }

    fetchConfig();
  }, [initialConfig]);

  const save = async () => {
    if (!Number.isFinite(form.overtimeThresholdHours) || form.overtimeThresholdHours < 0 || form.overtimeThresholdHours > 24) {
      toast.error("Minimal lembur harus antara 0 dan 24 jam");
      return;
    }
    if (form.lateToleranceMinutes < 0) {
      toast.error("Toleransi terlambat tidak boleh negatif");
      return;
    }
    if (form.lateDeductionAmount < 0) {
      toast.error("Potongan keterlambatan tidak boleh negatif");
      return;
    }
    if (DAY_LABELS.some(([day]) => !Number.isSafeInteger(form.absentDeductionByDay[day]) || form.absentDeductionByDay[day] < 0)) {
      toast.error("Potongan tidak hadir harus berupa angka bulat dan tidak boleh negatif");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/attendance-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal menyimpan konfigurasi attendance"),
        );
      }
      toast.success("Konfigurasi attendance berhasil disimpan");
      if (onSaved) onSaved();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan konfigurasi attendance",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Konfigurasi Kehadiran</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="overtime-threshold">Minimal Lembur (jam)</Label>
            <Input id="overtime-threshold" type="number" min={0} max={24} step={0.5}
              value={form.overtimeThresholdHours}
              onChange={(event) => setForm((current) => ({ ...current, overtimeThresholdHours: Number(event.target.value) }))} />
            <p className="text-xs text-muted-foreground">
              Tampilkan konfirmasi lembur saat checkout melewati akhir jadwal sebanyak jam ini.
              Contoh: 2 jam, jadwal selesai 17.00, konfirmasi muncul mulai 19.00. Isi 0 untuk menonaktifkan.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Toleransi Terlambat (menit)</Label>
            <Input
              type="number"
              min={0}
              value={form.lateToleranceMinutes}
              onChange={(e) =>
                setForm((p) => ({ ...p, lateToleranceMinutes: Number(e.target.value || 0) }))
              }
              />
          </div>

          <div className="space-y-1.5">
            <Label>Potongan per Keterlambatan</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={
                form.lateDeductionAmount
                  ? form.lateDeductionAmount.toLocaleString("id-ID")
                  : ""
              }
              onChange={(event) => {
                const numericValue = event.target.value.replace(/\D/g, "");
                setForm((current) => ({
                  ...current,
                  lateDeductionAmount: numericValue ? Number(numericValue) : 0,
                }));
              }}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              Dipotong satu kali untuk setiap hari berstatus terlambat pada payroll.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Potongan Tidak Hadir per Hari</Label>
            <p className="text-xs text-muted-foreground">Nominal tiap hari berlaku untuk tenant ini dan dihitung dari absensi berstatus tidak hadir saat payroll dibuat.</p>
            <div className="space-y-2">
              {DAY_LABELS.map(([day, label]) => (
                <div key={day} className="flex items-center gap-3 rounded-lg border p-2">
                  <Label htmlFor={`absent-${day}`} className="w-20 shrink-0">{label}</Label>
                  <Input
                    id={`absent-${day}`}
                    inputMode="numeric"
                    value={form.absentDeductionByDay[day] ? form.absentDeductionByDay[day].toLocaleString("id-ID") : ""}
                    placeholder="0"
                    onChange={(event) => {
                      const amount = Number(event.target.value.replace(/\D/g, "")) || 0;
                      setForm((current) => ({ ...current, absentDeductionByDay: { ...current.absentDeductionByDay, [day]: amount } }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-2">
              <Label>Absensi Waktu Istirahat</Label>
              <p className="text-xs text-muted-foreground">
                Aktifkan agar dapat menghitung durasi waktu istirahat karyawan.
              </p>
            </div>
            <Button
              className="w-24"
              type="button"
              variant={form.breakEnabled ? "default" : "outline"}
              onClick={() =>
                setForm((p) => ({ ...p, breakEnabled: !p.breakEnabled }))
              }
            >
              {form.breakEnabled ? "Aktif" : "Nonaktif"}
            </Button>
          </div>

          {form.breakEnabled && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-2">
                <Label>Bukti Foto Break</Label>
                <p className="text-xs text-muted-foreground">
                  Jika aktif, user akan diminta capture foto saat Break Check In dan Break Check Out.
                </p>
              </div>
              <Button
                className="w-24"
                type="button"
                variant={form.breakFaceCaptureEnabled ? "default" : "outline"}
                onClick={() =>
                  setForm((p) => ({ ...p, breakFaceCaptureEnabled: !p.breakFaceCaptureEnabled }))
                }
              >
                {form.breakFaceCaptureEnabled ? "Aktif" : "Nonaktif"}
              </Button>
            </div>
          )}

        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
