import type { PayrollSalarySummaryDto } from "@/lib/dto/payroll-calculation";
import { AUTO_ABSENT_DEDUCTION_COMPONENT_NAME, AUTO_LATE_DEDUCTION_COMPONENT_NAME, AUTO_OVERTIME_COMPONENT_NAME } from "@/lib/constants/payroll";

type PayrollComponentInput = {
  componentConfigId: string | null;
  nameSnapshot: string;
  typeSnapshot: string;
  inputTypeSnapshot: string;
  amount: number;
  baseValue: number | null;
};

const AUTOMATIC_COMPONENTS = [AUTO_OVERTIME_COMPONENT_NAME, AUTO_LATE_DEDUCTION_COMPONENT_NAME, AUTO_ABSENT_DEDUCTION_COMPONENT_NAME];

export function normalizePayrollComponentValues(items: unknown, basicSalary: number): PayrollComponentInput[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const nameSnapshot = String(row.nameSnapshot || row.name || "").trim();
    const typeSnapshot = String(row.typeSnapshot || row.type || "").toUpperCase();
    if (!nameSnapshot || AUTOMATIC_COMPONENTS.includes(nameSnapshot) || !["EARNING", "DEDUCTION"].includes(typeSnapshot)) return [];

    const inputTypeSnapshot = String(row.inputTypeSnapshot || row.inputType || "MANUAL").toUpperCase();
    const baseValue = inputTypeSnapshot === "PERCENTAGE" ? Number(row.baseValue ?? row.amount ?? 0) : null;
    const amount = inputTypeSnapshot === "PERCENTAGE" ? (basicSalary * Number(baseValue || 0)) / 100 : Number(row.amount || 0);
    return [{
      componentConfigId: row.componentConfigId ? String(row.componentConfigId) : null,
      nameSnapshot, typeSnapshot, inputTypeSnapshot,
      amount: Number.isFinite(amount) ? amount : 0,
      baseValue: baseValue !== null && Number.isFinite(baseValue) ? baseValue : null,
    }];
  });
}

export function getAutomaticPayrollComponents(salary: PayrollSalarySummaryDto, overtimeAmount: number): PayrollComponentInput[] {
  return [
    { nameSnapshot: AUTO_OVERTIME_COMPONENT_NAME, typeSnapshot: "EARNING", amount: overtimeAmount },
    { nameSnapshot: AUTO_LATE_DEDUCTION_COMPONENT_NAME, typeSnapshot: "DEDUCTION", amount: salary.lateDeductionAmount },
    { nameSnapshot: AUTO_ABSENT_DEDUCTION_COMPONENT_NAME, typeSnapshot: "DEDUCTION", amount: salary.absentDeductionAmount },
  ].filter((item) => item.amount > 0).map((item) => ({
    ...item, componentConfigId: null, inputTypeSnapshot: "FIXED", baseValue: null,
  }));
}

export function getPayrollTotals(basicSalary: number, components: PayrollComponentInput[]) {
  const allowances = components.filter((item) => item.typeSnapshot === "EARNING").reduce((sum, item) => sum + item.amount, 0);
  const deductions = components.filter((item) => item.typeSnapshot === "DEDUCTION").reduce((sum, item) => sum + item.amount, 0);
  return { allowances, deductions, totalSalary: basicSalary + allowances - deductions };
}
