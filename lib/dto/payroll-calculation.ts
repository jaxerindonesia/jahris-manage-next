import type { SalaryType } from "@/lib/dto/user";

export interface PayrollSalarySummaryDto {
  salaryType: SalaryType;
  salaryRate: number;
  paidAttendanceDays: number;
  basicSalary: number;
  lateDeductionRate: number;
  lateAttendanceDays: number;
  lateDeductionAmount: number;
  absentAttendanceDays: number;
  absentDeductionAmount: number;
}

export interface PayrollCalculationSummaryDto
  extends PayrollSalarySummaryDto {
  overtimeAmount: number;
  overtimeMinutes: number;
  overtimeEntries: number;
}
