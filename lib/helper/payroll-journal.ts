import type { Payroll, Prisma } from "@prisma/client";
import { AUTO_OVERTIME_COMPONENT_NAME } from "@/lib/constants/payroll";

export const PAYROLL_JOURNAL_PREFIX = "AUTO-PYR-";

export async function lockPayrollJournal(tx: Prisma.TransactionClient, tenantId: string | null) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll-journal:${tenantId ?? "global"}`}))`;
}

async function getAccount(
  tx: Prisma.TransactionClient,
  tenantId: string | null,
  categoryCode: string,
  categoryName: string,
  code: string,
  name: string,
  normalBalance: "DEBIT" | "CREDIT",
) {
  let category = await tx.accountCategory.findFirst({ where: { tenantId, code: categoryCode } });
  if (!category) category = await tx.accountCategory.create({ data: { tenantId, code: categoryCode, name: categoryName } });
  const existing = await tx.account.findFirst({ where: { tenantId, code } });
  if (existing) {
    if (!existing.isActive || existing.accountCategoryId !== category.id || existing.normalBalance !== normalBalance) {
      throw new Error(`Konfigurasi akun ${code} tidak sesuai untuk jurnal payroll`);
    }
    return existing;
  }
  return tx.account.create({ data: { tenantId, accountCategoryId: category.id, code, name, normalBalance } });
}

export async function syncPayrollJournal(tx: Prisma.TransactionClient, payroll: Payroll, creatorId: string) {
  const journalNo = `${PAYROLL_JOURNAL_PREFIX}${payroll.id}`;
  const existing = await tx.journal.findUnique({ where: { journalNo }, select: { id: true } });
  if (payroll.status.toUpperCase() !== "PAID") {
    if (existing) await tx.journal.update({ where: { id: existing.id }, data: { status: "VOID" } });
    return;
  }
  if (!Number.isFinite(payroll.totalSalary) || payroll.totalSalary <= 0) {
    throw new Error("Total pembayaran payroll harus lebih dari nol");
  }

  const employee = await tx.user.findFirst({
    where: { id: payroll.userId, tenantId: payroll.tenantId },
    select: { name: true },
  });
  if (!employee) throw new Error("Tenant karyawan tidak sesuai dengan payroll");
  const overtimeComponent = await tx.payrollComponentValue.aggregate({
    where: { payrollId: payroll.id, nameSnapshot: AUTO_OVERTIME_COMPONENT_NAME },
    _sum: { amount: true },
  });
  const overtimeAmount = Math.min(Math.max(Number(overtimeComponent._sum.amount || 0), 0), payroll.totalSalary);
  const salaryAmount = payroll.totalSalary - overtimeAmount;
  const salaryExpense = await getAccount(tx, payroll.tenantId, "5", "Beban", "5-PYR", "Beban Gaji", "DEBIT");
  const bank = await getAccount(tx, payroll.tenantId, "1", "Aset", "1-BANK-PYR", "Bank Payroll", "DEBIT");
  const details: Prisma.JournalDetailUncheckedCreateWithoutJournalInput[] = [];
  if (salaryAmount > 0) details.push({ accountId: salaryExpense.id, debit: salaryAmount, credit: 0 });
  if (overtimeAmount > 0) {
    const overtimePayable = await getAccount(tx, payroll.tenantId, "2", "Kewajiban", "2-OT", "Utang Lembur", "CREDIT");
    details.push({ accountId: overtimePayable.id, debit: overtimeAmount, credit: 0 });
  }
  details.push({ accountId: bank.id, debit: 0, credit: payroll.totalSalary });
  const data = {
    date: payroll.paidAt ?? payroll.updatedAt,
    referenceNo: payroll.referenceNumber ?? `PAYROLL-${payroll.id}`,
    description: `[AUTO] Payroll ${employee.name} - ${String(payroll.month).padStart(2, "0")}/${payroll.year}`,
    createdBy: creatorId,
    status: "POSTED" as const,
  };

  if (existing) {
    await tx.journal.update({ where: { id: existing.id }, data: { ...data, details: { deleteMany: {}, create: details } } });
  } else {
    await tx.journal.create({ data: { ...data, journalNo, details: { create: details } } });
  }
}
