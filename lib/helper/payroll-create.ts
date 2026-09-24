import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { AUTO_ABSENT_DEDUCTION_COMPONENT_NAME, AUTO_LATE_DEDUCTION_COMPONENT_NAME, AUTO_OVERTIME_COMPONENT_NAME } from "@/lib/constants/payroll";
import { getApprovedOvertimePayoutSummary } from "@/lib/helper/payroll-overtime";
import { getPayrollSalarySummary } from "@/lib/helper/payroll-salary";
import { lockPayrollJournal, syncPayrollJournal } from "@/lib/helper/payroll-journal";

type ComponentValue = {
  componentConfigId: string | null;
  nameSnapshot: string;
  typeSnapshot: string;
  inputTypeSnapshot: string;
  amount: number;
  baseValue: number | null;
};

function buildReferenceNumber(id: string, createdAt: Date) {
  return `PYR-${createdAt.getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
}

function normalizeValues(items: unknown[], basicSalary: number): ComponentValue[] {
  return (Array.isArray(items) ? items : []).map((item) => {
    const row = item as Record<string, unknown>;
    const inputTypeSnapshot = String(row.inputTypeSnapshot || row.inputType || "MANUAL").toUpperCase();
    const baseValue = inputTypeSnapshot === "PERCENTAGE" ? Number(row.baseValue ?? row.amount ?? 0) : null;
    const amount = inputTypeSnapshot === "PERCENTAGE"
      ? (basicSalary * Number(baseValue || 0)) / 100
      : Number(row.amount || 0);
    return {
      componentConfigId: row.componentConfigId ? String(row.componentConfigId) : null,
      nameSnapshot: String(row.nameSnapshot || row.name || "").trim(),
      typeSnapshot: String(row.typeSnapshot || row.type || "").toUpperCase(),
      inputTypeSnapshot,
      amount: Number.isFinite(amount) ? amount : 0,
      baseValue: baseValue !== null && Number.isFinite(baseValue) ? baseValue : null,
    };
  }).filter((item) => item.nameSnapshot && ![AUTO_OVERTIME_COMPONENT_NAME, AUTO_LATE_DEDUCTION_COMPONENT_NAME, AUTO_ABSENT_DEDUCTION_COMPONENT_NAME].includes(item.nameSnapshot) && ["EARNING", "DEDUCTION"].includes(item.typeSnapshot));
}

async function getDefaultValues(tenantId: string | null, basicSalary: number) {
  const configs = await prisma.payrollComponentConfig.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return configs.map((config) => ({
    componentConfigId: config.id,
    nameSnapshot: config.name,
    typeSnapshot: config.type,
    inputTypeSnapshot: config.inputType,
    baseValue: config.inputType === "PERCENTAGE" ? config.defaultValue : null,
    amount: config.inputType === "PERCENTAGE" ? (basicSalary * config.defaultValue) / 100 : config.defaultValue,
  }));
}

export async function createPayrollForUser(params: {
  tenantId: string | null;
  userId: string;
  month: number;
  year: number;
  status: string;
  paidAt?: string | null;
  startDate?: string;
  endDate?: string;
  componentValues?: unknown[];
  creatorId: string;
}) {
  const salary = await getPayrollSalarySummary(params);
  const existing = await prisma.payroll.findFirst({ where: { userId: params.userId, month: params.month, year: params.year, tenantId: salary.tenantId } });
  if (existing) return null;

  const values = params.componentValues
    ? normalizeValues(params.componentValues, salary.basicSalary)
    : await getDefaultValues(salary.tenantId, salary.basicSalary);
  const overtime = await getApprovedOvertimePayoutSummary(params);
  if (overtime.totalAmount > 0) values.push({ componentConfigId: null, nameSnapshot: AUTO_OVERTIME_COMPONENT_NAME, typeSnapshot: "EARNING", inputTypeSnapshot: "FIXED", amount: overtime.totalAmount, baseValue: null });
  if (salary.lateDeductionAmount > 0) values.push({ componentConfigId: null, nameSnapshot: AUTO_LATE_DEDUCTION_COMPONENT_NAME, typeSnapshot: "DEDUCTION", inputTypeSnapshot: "FIXED", amount: salary.lateDeductionAmount, baseValue: null });
  if (salary.absentDeductionAmount > 0) values.push({ componentConfigId: null, nameSnapshot: AUTO_ABSENT_DEDUCTION_COMPONENT_NAME, typeSnapshot: "DEDUCTION", inputTypeSnapshot: "FIXED", amount: salary.absentDeductionAmount, baseValue: null });
  const allowances = values.filter((item) => item.typeSnapshot === "EARNING").reduce((sum, item) => sum + item.amount, 0);
  const deductions = values.filter((item) => item.typeSnapshot === "DEDUCTION").reduce((sum, item) => sum + item.amount, 0);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockPayrollJournal(tx, salary.tenantId);
    const payroll = await tx.payroll.create({ data: {
      tenantId: salary.tenantId, userId: params.userId, month: params.month, year: params.year,
      basicSalary: salary.basicSalary, salaryType: salary.salaryType, salaryRate: salary.salaryRate,
      paidAttendanceDays: salary.paidAttendanceDays, lateDeductionRate: salary.lateDeductionRate,
      lateAttendanceDays: salary.lateAttendanceDays, lateDeductionAmount: salary.lateDeductionAmount,
      allowances, deductions, totalSalary: salary.basicSalary + allowances - deductions,
      status: params.status, paidAt: params.paidAt ? new Date(params.paidAt) : null,
    } });
    const updated = await tx.payroll.update({ where: { id: payroll.id }, data: { referenceNumber: buildReferenceNumber(payroll.id, payroll.createdAt) } });
    if (values.length) await tx.payrollComponentValue.createMany({ data: values.map((item) => ({ ...item, payrollId: payroll.id })) });
    await syncPayrollJournal(tx, updated, params.creatorId);
    return updated;
  });
}
