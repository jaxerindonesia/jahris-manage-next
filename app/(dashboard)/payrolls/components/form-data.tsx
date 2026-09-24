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
import EmployeeSearchSelect from "@/components/employee-search-select";

import { PayrollDto } from "@/lib/dto/payroll";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { months } from "@/lib/helper/date";
import { formatCurrency } from "@/lib/helper/format-currency";
import { parseApiError } from "@/lib/helper/response-api";
import type { PayrollComponentConfigDto, PayrollComponentValueDto } from "@/lib/dto/payroll-component";
import type { PayrollCalculationSummaryDto } from "@/lib/dto/payroll-calculation";
import {
  AUTO_LATE_DEDUCTION_COMPONENT_NAME,
  AUTO_ABSENT_DEDUCTION_COMPONENT_NAME,
  AUTO_OVERTIME_COMPONENT_NAME,
} from "@/lib/constants/payroll";
import { Info } from "lucide-react";

const createDefaultFormData = (): PayrollDto => ({
  userId: "",
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  basicSalary: 0,
  allowances: 0,
  deductions: 0,
  totalSalary: 0,
  status: "PENDING",
});

export default function FormData({
  isOpen,
  initialData,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  initialData?: PayrollDto;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [componentConfigs, setComponentConfigs] = useState<PayrollComponentConfigDto[]>([]);
  const [overtimeAmount, setOvertimeAmount] = useState(0);
  const [lateDeductionAmount, setLateDeductionAmount] = useState(0);
  const [absentDeductionAmount, setAbsentDeductionAmount] = useState(0);
  const [calculationSummary, setCalculationSummary] =
    useState<PayrollCalculationSummaryDto | null>(null);
  const [formData, setFormData] = useState<PayrollDto>(createDefaultFormData);
  const [periodMode, setPeriodMode] = useState<"month" | "range">("month");
  const [targetMode, setTargetMode] = useState<"single" | "all">("single");
  const [rangeStartDate, setRangeStartDate] = useState<string>(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}-01`;
  });
  const [rangeEndDate, setRangeEndDate] = useState<string>(() => {
    const d = new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${String(lastDay).padStart(2, "0")}`;
  });

  const computedAllowances = (formData.componentValues || [])
    .filter((item) => item.typeSnapshot === "EARNING")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const computedDeductions = (formData.componentValues || [])
    .filter((item) => item.typeSnapshot === "DEDUCTION")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const buildComponentValues = (
    configs: PayrollComponentConfigDto[],
    basicSalary: number,
    existingValues?: PayrollComponentValueDto[],
    overtimeTotal = 0,
    lateDeductionTotal = 0,
    absentDeductionTotal = 0,
  ) =>
    [
      ...configs
        .filter((item) => item.isActive !== false)
        .map((config) => {
          const existing = existingValues?.find(
            (value) =>
              value.componentConfigId === config.id ||
              value.nameSnapshot === config.name,
          );
          const inputTypeSnapshot = config.inputType;
          const baseValue =
            inputTypeSnapshot === "PERCENTAGE"
              ? Number(existing?.baseValue ?? config.defaultValue ?? 0)
              : null;
          const amount =
            inputTypeSnapshot === "PERCENTAGE"
              ? (basicSalary * Number(baseValue || 0)) / 100
              : existing?.amount !== undefined
                ? Number(existing.amount || 0)
                : Number(config.defaultValue || 0);

          return {
            id: existing?.id ?? null,
            payrollId: existing?.payrollId ?? null,
            componentConfigId: config.id ?? null,
            nameSnapshot: config.name,
            typeSnapshot: config.type,
            inputTypeSnapshot,
            baseValue,
            amount,
          } satisfies PayrollComponentValueDto;
        }),
      ...(overtimeTotal > 0
        ? [{
          id: null,
          payrollId: null,
          componentConfigId: null,
          nameSnapshot: AUTO_OVERTIME_COMPONENT_NAME,
          typeSnapshot: "EARNING",
          inputTypeSnapshot: "FIXED",
          baseValue: null,
          amount: overtimeTotal,
        } satisfies PayrollComponentValueDto]
        : []),
      ...(lateDeductionTotal > 0
        ? [{
          id: null,
          payrollId: null,
          componentConfigId: null,
          nameSnapshot: AUTO_LATE_DEDUCTION_COMPONENT_NAME,
          typeSnapshot: "DEDUCTION",
          inputTypeSnapshot: "FIXED",
          baseValue: null,
          amount: lateDeductionTotal,
        } satisfies PayrollComponentValueDto]
        : []),
      ...(absentDeductionTotal > 0
        ? [{
          id: null,
          payrollId: null,
          componentConfigId: null,
          nameSnapshot: AUTO_ABSENT_DEDUCTION_COMPONENT_NAME,
          typeSnapshot: "DEDUCTION",
          inputTypeSnapshot: "FIXED",
          baseValue: null,
          amount: absentDeductionTotal,
        } satisfies PayrollComponentValueDto]
        : []),
    ];

  const rebuildComponentValues = (
    basicSalary: number,
    sourceValues?: PayrollComponentValueDto[],
    overtimeTotal = overtimeAmount,
    lateDeductionTotal = lateDeductionAmount,
    absentDeductionTotal = absentDeductionAmount,
  ) => {
    const manualValues = (sourceValues ?? formData.componentValues ?? []).filter(
      (item) =>
        item.nameSnapshot !== AUTO_OVERTIME_COMPONENT_NAME &&
        item.nameSnapshot !== AUTO_LATE_DEDUCTION_COMPONENT_NAME &&
        item.nameSnapshot !== AUTO_ABSENT_DEDUCTION_COMPONENT_NAME,
    );
    return buildComponentValues(
      componentConfigs,
      basicSalary,
      manualValues,
      overtimeTotal,
      lateDeductionTotal,
      absentDeductionTotal,
    );
  };

  const fetchPayrollSummary = async (params: {
    userId: string;
    month: number;
    year: number;
    startDate?: string;
    endDate?: string;
    sourceValues?: PayrollComponentValueDto[];
  }) => {
    const { userId, month, year, startDate, endDate, sourceValues } = params;

    if (!userId || !month || !year) {
      setOvertimeAmount(0);
      setLateDeductionAmount(0);
      setAbsentDeductionAmount(0);
      setCalculationSummary(null);
      setFormData((current) => ({
        ...current,
        userId,
        month,
        year,
        basicSalary: 0,
        componentValues: rebuildComponentValues(0, sourceValues, 0, 0),
      }));
      return;
    }

    try {
      const searchParams = new URLSearchParams({
        userId,
        month: String(month),
        year: String(year),
      });
      if (startDate) searchParams.set("startDate", startDate);
      if (endDate) searchParams.set("endDate", endDate);
      const res = await fetch(
        `/api/payrolls/calculation-summary?${searchParams.toString()}`,
      );
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal menghitung payroll"),
        );
      }
      const json = await res.json();
      const summary = json.data as PayrollCalculationSummaryDto;
      const basicSalary = Number(summary.basicSalary || 0);
      const totalAmount = Number(summary.overtimeAmount || 0);
      const lateDeductionTotal = Number(summary.lateDeductionAmount || 0);
      const absentDeductionTotal = Number(summary.absentDeductionAmount || 0);
      setCalculationSummary(summary);
      setOvertimeAmount(totalAmount);
      setLateDeductionAmount(lateDeductionTotal);
      setAbsentDeductionAmount(absentDeductionTotal);
      setFormData((current) => ({
        ...current,
        userId,
        month,
        year,
        basicSalary,
        componentValues: rebuildComponentValues(
          basicSalary,
          sourceValues ?? current.componentValues,
          totalAmount,
          lateDeductionTotal,
          absentDeductionTotal,
        ),
      }));
    } catch (error) {
      setOvertimeAmount(0);
      setLateDeductionAmount(0);
      setAbsentDeductionAmount(0);
      setCalculationSummary(null);
      toast.error(
        error instanceof Error ? error.message : "Gagal menghitung payroll",
      );
      setFormData((current) => ({
        ...current,
        userId,
        month,
        year,
        basicSalary: 0,
        componentValues: rebuildComponentValues(0, sourceValues, 0, 0),
      }));
    }
  };

  const fetchComponentConfigs = async () => {
    try {
      const res = await fetch("/api/payroll-component-config");
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, "Gagal mengambil komponen payroll"),
        );
      }
      const json = await res.json();
      setComponentConfigs(json.data || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat komponen payroll",
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = formData.id ? `/api/payrolls/${formData.id}` : "/api/payrolls";
      const method = formData.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          userId: targetMode === "all" ? "" : formData.userId,
          allEmployees: targetMode === "all",
          allowances: computedAllowances,
          deductions: computedDeductions,
          startDate: periodMode === "range" ? rangeStartDate : undefined,
          endDate: periodMode === "range" ? rangeEndDate : undefined,
        }),
      });

      if (!res.ok) throw new Error(await parseApiError(res, "Gagal menyimpan data"));
      const response = await res.json().catch(() => null);
      toast.success(response?.message || `Data gaji berhasil ${formData.id ? "diupdate" : "disimpan"}!`);

      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchComponentConfigs();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setTargetMode("single");
      const baseSalary = Number(initialData.basicSalary || 0);
      const sourceValues = (initialData.componentValues || []).filter(
        (item) =>
          item.nameSnapshot !== AUTO_OVERTIME_COMPONENT_NAME &&
          item.nameSnapshot !== AUTO_LATE_DEDUCTION_COMPONENT_NAME &&
          item.nameSnapshot !== AUTO_ABSENT_DEDUCTION_COMPONENT_NAME,
      );
      setFormData({
        ...createDefaultFormData(),
        ...initialData,
        userId: initialData.userId || initialData.user?.id || "",
        componentValues: rebuildComponentValues(baseSalary, sourceValues, 0),
      });
      void fetchPayrollSummary({
        userId: initialData.userId || initialData.user?.id || "",
        month: Number(initialData.month || createDefaultFormData().month),
        year: Number(initialData.year || createDefaultFormData().year),
        sourceValues,
      });
      return;
    }

    const defaultData = createDefaultFormData();
    setTargetMode("single");
    setOvertimeAmount(0);
    setLateDeductionAmount(0);
    setAbsentDeductionAmount(0);
    setCalculationSummary(null);
    setFormData({
      ...defaultData,
      componentValues: rebuildComponentValues(defaultData.basicSalary, [], 0),
    });
  }, [componentConfigs, initialData, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="!w-[calc(100vw-4rem)] !max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {formData.id ? "Edit Payroll" : "Tambah Payroll Baru"}
          </DialogTitle>
          <DialogDescription>
            Masukkan data gaji karyawan untuk bulan ini
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Employee Name */}
            {!formData.id && (
              <div className="grid gap-2">
                <Label>Tujuan Payroll</Label>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <Button type="button" variant={targetMode === "single" ? "default" : "ghost"} onClick={() => setTargetMode("single")}>Pilih Karyawan</Button>
                  <Button type="button" variant={targetMode === "all" ? "default" : "ghost"} onClick={() => setTargetMode("all")}>Seluruh Karyawan</Button>
                </div>
              </div>
            )}
            {targetMode === "single" ? (
              <div className="grid gap-2">
                <Label htmlFor="employeeName">Nama Karyawan</Label>
                <EmployeeSearchSelect
                value={formData.userId || ""}
                onChange={(val) => {
                  const end = new Date(rangeEndDate);
                  void fetchPayrollSummary({
                    userId: val,
                    month: periodMode === "range" ? end.getMonth() + 1 : Number(formData.month || createDefaultFormData().month),
                    year: periodMode === "range" ? end.getFullYear() : Number(formData.year || createDefaultFormData().year),
                    startDate: periodMode === "range" ? rangeStartDate : undefined,
                    endDate: periodMode === "range" ? rangeEndDate : undefined,
                    sourceValues: formData.componentValues,
                  });
                }}
                placeholder="Pilih Karyawan"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                  Payroll akan dibuat untuk seluruh karyawan. Nominal dihitung secara individual berdasarkan data masing-masing karyawan.
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Komponen yang Dihitung Otomatis</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Nilai setiap komponen berbeda untuk masing-masing karyawan dan akan tersimpan pada detail payroll mereka.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { name: "Gaji Pokok", type: "PENGHASILAN", description: "Sesuai gaji bulanan atau jumlah hari kerja" },
                      { name: AUTO_OVERTIME_COMPONENT_NAME, type: "PENGHASILAN", description: "Dari lembur yang telah disetujui" },
                      { name: AUTO_LATE_DEDUCTION_COMPONENT_NAME, type: "POTONGAN", description: "Dari data keterlambatan periode ini" },
                      { name: AUTO_ABSENT_DEDUCTION_COMPONENT_NAME, type: "POTONGAN", description: "Dari data ketidakhadiran periode ini" },
                      ...componentConfigs.filter((item) => item.isActive !== false).map((item) => ({
                        name: item.name,
                        type: item.type === "EARNING" ? "PENGHASILAN" : "POTONGAN",
                        description: item.inputType === "PERCENTAGE"
                          ? `${Number(item.defaultValue || 0)}% dari gaji pokok`
                          : `Nilai default ${formatCurrency(Number(item.defaultValue || 0))}`,
                      })),
                    ].map((item, index) => (
                      <div key={`${item.name}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.type === "POTONGAN" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>{item.type}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Period Selection */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Periode Gaji
                </Label>
                <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodMode("month");
                      void fetchPayrollSummary({
                        userId: formData.userId || "",
                        month: Number(formData.month || createDefaultFormData().month),
                        year: Number(formData.year || createDefaultFormData().year),
                        sourceValues: formData.componentValues,
                      });
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                      periodMode === "month"
                        ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    By Bulan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodMode("range");
                      const end = new Date(rangeEndDate);
                      void fetchPayrollSummary({
                        userId: formData.userId || "",
                        month: end.getMonth() + 1,
                        year: end.getFullYear(),
                        startDate: rangeStartDate,
                        endDate: rangeEndDate,
                        sourceValues: formData.componentValues,
                      });
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                      periodMode === "range"
                        ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    By Range Tanggal
                  </button>
                </div>
              </div>

              {periodMode === "month" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="month">Bulan</Label>
                    <Select
                      value={String(formData.month)}
                      onValueChange={(value) =>
                        void fetchPayrollSummary({
                          userId: formData.userId || "",
                          month: Number(value),
                          year: Number(formData.year || createDefaultFormData().year),
                          sourceValues: formData.componentValues,
                        })
                      }
                    >
                      <SelectTrigger id="month" className="w-full bg-white dark:bg-slate-800">
                        <SelectValue placeholder="Pilih Bulan" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map((m) => (
                          <SelectItem key={m.value} value={String(m.value)}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="year">Tahun</Label>
                    <Input
                      id="year"
                      type="number"
                      value={formData.year}
                      onChange={(e) =>
                        void fetchPayrollSummary({
                          userId: formData.userId || "",
                          month: Number(formData.month || createDefaultFormData().month),
                          year: parseInt(e.target.value) || new Date().getFullYear(),
                          sourceValues: formData.componentValues,
                        })
                      }
                      className="bg-white dark:bg-slate-800"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="rangeStartDate">Tanggal Mulai</Label>
                      <Input
                        id="rangeStartDate"
                        type="date"
                        value={rangeStartDate}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          setRangeStartDate(newStart);
                          const end = new Date(rangeEndDate);
                          void fetchPayrollSummary({
                            userId: formData.userId || "",
                            month: end.getMonth() + 1,
                            year: end.getFullYear(),
                            startDate: newStart,
                            endDate: rangeEndDate,
                            sourceValues: formData.componentValues,
                          });
                        }}
                        className="bg-white dark:bg-slate-800"
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="rangeEndDate">Tanggal Selesai</Label>
                      <Input
                        id="rangeEndDate"
                        type="date"
                        value={rangeEndDate}
                        min={rangeStartDate || undefined}
                        onChange={(e) => {
                          const newEnd = e.target.value;
                          setRangeEndDate(newEnd);
                          const end = new Date(newEnd);
                          void fetchPayrollSummary({
                            userId: formData.userId || "",
                            month: end.getMonth() + 1,
                            year: end.getFullYear(),
                            startDate: rangeStartDate,
                            endDate: newEnd,
                            sourceValues: formData.componentValues,
                          });
                        }}
                        className="bg-white dark:bg-slate-800"
                        required
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Perhitungan kehadiran dan lembur dihitung berdasarkan rentang tanggal ini. Periode slip tercatat pada bulan {months.find(m => m.value === (new Date(rangeEndDate).getMonth() + 1))?.label} {new Date(rangeEndDate).getFullYear()}.
                  </p>
                </div>
              )}
            </div>

            {/* Salary Details */}
            {targetMode === "single" && <div className="grid gap-2">
              <Label htmlFor="basicSalary">Gaji Pokok</Label>
              <Input
                id="basicSalary"
                type="text"
                value={formData.basicSalary ? formData.basicSalary.toLocaleString("id-ID") : ""}
                placeholder="0"
                disabled
                required
              />
            </div>}

            {targetMode === "single" && calculationSummary && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
                {calculationSummary.salaryType === "daily" ? (
                  <p className="text-slate-700 dark:text-slate-300">
                    Gaji harian: {formatCurrency(calculationSummary.salaryRate)} ×{" "}
                    {calculationSummary.paidAttendanceDays} hari hadir ={" "}
                    <span className="font-semibold">
                      {formatCurrency(calculationSummary.basicSalary)}
                    </span>
                  </p>
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">
                    Gaji bulanan: {formatCurrency(calculationSummary.basicSalary)}
                  </p>
                )}
                {calculationSummary.lateAttendanceDays > 0 && (
                  <p className="mt-1 text-red-600 dark:text-red-400">
                    Potongan terlambat: {formatCurrency(calculationSummary.lateDeductionRate)} ×{" "}
                    {calculationSummary.lateAttendanceDays} hari ={" "}
                    <span className="font-semibold">
                      {formatCurrency(calculationSummary.lateDeductionAmount)}
                    </span>
                  </p>
                )}
                {calculationSummary.absentAttendanceDays > 0 && (
                  <p className="mt-1 text-red-600 dark:text-red-400">
                    Potongan tidak hadir: {calculationSummary.absentAttendanceDays} hari ={" "}
                    <span className="font-semibold">{formatCurrency(calculationSummary.absentDeductionAmount)}</span>
                  </p>
                )}
              </div>
            )}

            {targetMode === "single" && (componentConfigs.length > 0 || (formData.componentValues?.length ?? 0) > 0) && (
              <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Komponen Payroll</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Komponen ini mengikuti konfigurasi payroll dan otomatis masuk ke perhitungan total gaji.
                  </p>
                </div>

                <div className="space-y-4">
                  {["EARNING", "DEDUCTION"].map((type) => {
                    const sectionItems = (formData.componentValues || []).filter(
                      (item) => item.typeSnapshot === type,
                    );
                    if (sectionItems.length === 0) return null;

                    return (
                      <div key={type} className="space-y-3">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {type === "EARNING" ? "Penghasilan Tambahan" : "Potongan"}
                        </div>
                        {sectionItems.map((item, index) => {
                          const currentIndex = (formData.componentValues || []).findIndex(
                            (value) =>
                              value.componentConfigId === item.componentConfigId &&
                              value.nameSnapshot === item.nameSnapshot,
                          );
                          const displayValue =
                            item.inputTypeSnapshot === "PERCENTAGE"
                              ? String(item.baseValue ?? 0)
                              : item.amount
                                ? item.amount.toLocaleString("id-ID")
                                : "";
                          const automaticDescription =
                            item.nameSnapshot === AUTO_OVERTIME_COMPONENT_NAME
                              ? "Otomatis dari lembur yang disetujui pada periode ini."
                              : item.nameSnapshot === AUTO_LATE_DEDUCTION_COMPONENT_NAME
                                ? "Otomatis dari jumlah keterlambatan pada periode ini."
                                : item.nameSnapshot === AUTO_ABSENT_DEDUCTION_COMPONENT_NAME
                                ? "Otomatis dari absensi tidak hadir sesuai tarif hari tenant."
                                : null;

                          return (
                            <div key={`${item.componentConfigId || item.nameSnapshot}-${index}`} className="grid grid-cols-1 gap-3 md:grid-cols-12">
                              <div className="grid gap-2 md:col-span-5">
                                <div>
                                  <Label className="whitespace-nowrap">
                                    {item.nameSnapshot}
                                    {automaticDescription && (
                                      <span
                                        title={automaticDescription}
                                        aria-label={automaticDescription}
                                        className="text-slate-400"
                                      >
                                        <Info className="size-4" />
                                      </span>
                                    )}
                                  </Label>
                                </div>
                                <Input value={item.nameSnapshot} disabled />
                              </div>
                              <div className="grid gap-2 md:col-span-3">
                                <div>
                                  <Label>{item.inputTypeSnapshot === "PERCENTAGE" ? "Persentase (%)" : "Nominal"}</Label>
                                </div>
                                <Input
                                  type={item.inputTypeSnapshot === "PERCENTAGE" ? "number" : "text"}
                                  value={displayValue}
                                  disabled={
                                    item.nameSnapshot === AUTO_OVERTIME_COMPONENT_NAME ||
                                    item.nameSnapshot === AUTO_LATE_DEDUCTION_COMPONENT_NAME ||
                                    item.nameSnapshot === AUTO_ABSENT_DEDUCTION_COMPONENT_NAME
                                  }
                                  onChange={(e) => {
                                    const nextValues = [...(formData.componentValues || [])];
                                    if (currentIndex < 0) return;

                                    if (item.inputTypeSnapshot === "PERCENTAGE") {
                                      const nextBaseValue = Number(e.target.value || 0);
                                      nextValues[currentIndex] = {
                                        ...item,
                                        baseValue: nextBaseValue,
                                        amount: (Number(formData.basicSalary || 0) * nextBaseValue) / 100,
                                      };
                                    } else {
                                      const numericValue = e.target.value.replace(/\D/g, "");
                                      nextValues[currentIndex] = {
                                        ...item,
                                        amount: numericValue ? Number(numericValue) : 0,
                                      };
                                    }

                                    setFormData({
                                      ...formData,
                                      componentValues: nextValues,
                                    });
                                  }}
                                />
                              </div>
                              <div className="grid gap-2 md:col-span-4">
                                <div>
                                  <Label>Nilai Terhitung</Label>
                                </div>
                                <Input
                                  value={formatCurrency(Number(item.amount || 0))}
                                  disabled
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Status */}
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: "PAID" | "PENDING") =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Total Preview */}
            {targetMode === "single" && <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 dark:border-blue-900/50 dark:bg-blue-950/20">
              <p className="mb-1 text-sm text-blue-600 dark:text-blue-300">Total Gaji:</p>
              <p className="text-md font-bold text-blue-600 dark:text-blue-200">
                {formatCurrency(
                  (formData.basicSalary || 0) +
                    computedAllowances -
                    computedDeductions,
                )}
              </p>
              <p className="mt-1 text-xs text-blue-500 dark:text-blue-300/80">
                Penghasilan tambahan: {formatCurrency(computedAllowances)} | Potongan: {formatCurrency(computedDeductions)}
              </p>
            </div>}
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>

            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : formData.id ? "Update" : "Simpan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
