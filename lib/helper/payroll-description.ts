import type { PayrollDto } from "@/lib/dto/payroll";
import type { PayrollComponentValueDto } from "@/lib/dto/payroll-component";
import { AUTO_ABSENT_DEDUCTION_COMPONENT_NAME, AUTO_LATE_DEDUCTION_COMPONENT_NAME, AUTO_OVERTIME_COMPONENT_NAME } from "@/lib/constants/payroll";
import { formatCurrency } from "@/lib/helper/format-currency";

export function getPayrollSalaryDescription(payroll: Pick<PayrollDto, "salaryType" | "salaryRate" | "paidAttendanceDays" | "basicSalary">) {
  if (payroll.salaryType !== "daily") return `Gaji bulanan: ${formatCurrency(payroll.basicSalary)}`;
  return `${formatCurrency(payroll.salaryRate ?? 0)} × ${payroll.paidAttendanceDays ?? 0} hari hadir = ${formatCurrency(payroll.basicSalary)}`;
}

export function getPayrollComponentDescription(
  component: PayrollComponentValueDto,
  payroll: Pick<PayrollDto, "basicSalary" | "lateDeductionRate" | "lateAttendanceDays" | "absentAttendanceDays">,
) {
  if (component.nameSnapshot === AUTO_LATE_DEDUCTION_COMPONENT_NAME) {
    return `${formatCurrency(payroll.lateDeductionRate ?? 0)} × ${payroll.lateAttendanceDays ?? 0} hari terlambat`;
  }
  if (component.nameSnapshot === AUTO_ABSENT_DEDUCTION_COMPONENT_NAME) {
    return `${payroll.absentAttendanceDays ?? 0} hari tidak hadir, sesuai tarif hari kerja perusahaan`;
  }
  if (component.nameSnapshot === AUTO_OVERTIME_COMPONENT_NAME) {
    return "Lembur yang disetujui pada periode payroll ini";
  }
  if (component.inputTypeSnapshot === "PERCENTAGE") {
    return `${component.baseValue ?? 0}% × gaji pokok ${formatCurrency(payroll.basicSalary)}`;
  }
  return component.inputTypeSnapshot === "FIXED" ? "Nominal tetap" : "Nominal yang diisi pada payroll";
}
