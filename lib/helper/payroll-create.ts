import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAutomaticPayrollComponents, getPayrollTotals, normalizePayrollComponentValues } from "@/lib/helper/payroll-components";
import { getApprovedOvertimePayoutSummary } from "@/lib/helper/payroll-overtime";
import { getPayrollSalarySummary } from "@/lib/helper/payroll-salary";
import { lockPayrollJournal, syncPayrollJournal } from "@/lib/helper/payroll-journal";

function buildReferenceNumber(id: string, createdAt: Date) {
  return `PYR-${createdAt.getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
}

async function getDefaultValues(tenantId: string | null, basicSalary: number) {
  const configs = await prisma.payrollComponentConfig.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return normalizePayrollComponentValues(configs.map((config) => ({
    componentConfigId: config.id,
    nameSnapshot: config.name,
    typeSnapshot: config.type,
    inputTypeSnapshot: config.inputType,
    baseValue: config.defaultValue,
    amount: config.defaultValue,
  })), basicSalary);
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
  const existing = await prisma.payroll.findFirst({ where: {
    userId: params.userId,
    month: params.month,
    year: params.year,
    periodStartDate: params.startDate ? new Date(`${params.startDate}T00:00:00.000Z`) : null,
    periodEndDate: params.endDate ? new Date(`${params.endDate}T00:00:00.000Z`) : null,
    tenantId: salary.tenantId,
  } });
  if (existing) return null;

  const values = params.componentValues
    ? normalizePayrollComponentValues(params.componentValues, salary.basicSalary)
    : await getDefaultValues(salary.tenantId, salary.basicSalary);
  const overtime = await getApprovedOvertimePayoutSummary({ ...params, tenantId: salary.tenantId });
  values.push(...getAutomaticPayrollComponents(salary, overtime.totalAmount));
  const { allowances, deductions, totalSalary } = getPayrollTotals(salary.basicSalary, values);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockPayrollJournal(tx, salary.tenantId);
    const payroll = await tx.payroll.create({ data: {
      tenantId: salary.tenantId, userId: params.userId, month: params.month, year: params.year,
      periodStartDate: params.startDate ? new Date(`${params.startDate}T00:00:00.000Z`) : null,
      periodEndDate: params.endDate ? new Date(`${params.endDate}T00:00:00.000Z`) : null,
      basicSalary: salary.basicSalary, salaryType: salary.salaryType, salaryRate: salary.salaryRate,
      paidAttendanceDays: salary.paidAttendanceDays, lateDeductionRate: salary.lateDeductionRate,
      lateAttendanceDays: salary.lateAttendanceDays, lateDeductionAmount: salary.lateDeductionAmount,
      absentAttendanceDays: salary.absentAttendanceDays, absentDeductionAmount: salary.absentDeductionAmount,
      allowances, deductions, totalSalary,
      status: params.status, paidAt: params.paidAt ? new Date(params.paidAt) : null,
    } });
    const updated = await tx.payroll.update({ where: { id: payroll.id }, data: { referenceNumber: buildReferenceNumber(payroll.id, payroll.createdAt) } });
    if (values.length) await tx.payrollComponentValue.createMany({ data: values.map((item) => ({ ...item, payrollId: payroll.id })) });
    await syncPayrollJournal(tx, updated, params.creatorId);
    return { ...updated, componentValues: values };
  });
}
