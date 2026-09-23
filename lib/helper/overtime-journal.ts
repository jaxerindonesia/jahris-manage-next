import type { Overtime, Prisma } from "@prisma/client";

export const OVERTIME_JOURNAL_PREFIX = "AUTO-OT-";

export async function lockOvertimeJournal(tx: Prisma.TransactionClient, tenantId: string | null) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`overtime-journal:${tenantId ?? "global"}`}))`;
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
      throw new Error(`Konfigurasi akun ${code} tidak sesuai untuk jurnal lembur`);
    }
    return existing;
  }
  return tx.account.create({ data: { tenantId, accountCategoryId: category.id, code, name, normalBalance } });
}

export async function syncOvertimeJournal(tx: Prisma.TransactionClient, overtime: Overtime, creatorId: string) {
  const journalNo = `${OVERTIME_JOURNAL_PREFIX}${overtime.id}`;
  const existing = await tx.journal.findUnique({ where: { journalNo }, select: { id: true } });
  if (overtime.status.toUpperCase() !== "APPROVED") {
    if (existing) await tx.journal.update({ where: { id: existing.id }, data: { status: "VOID" } });
    return;
  }
  if (!Number.isFinite(overtime.payoutAmount) || overtime.payoutAmount <= 0) {
    throw new Error("Nominal pembayaran lembur harus lebih dari nol");
  }

  const employee = await tx.user.findFirst({
    where: { id: overtime.userId, tenantId: overtime.tenantId },
    select: { name: true },
  });
  if (!employee) throw new Error("Tenant karyawan tidak sesuai dengan lembur");
  const expense = await getAccount(tx, overtime.tenantId, "5", "Beban", "5-OT", "Beban Lembur", "DEBIT");
  const payable = await getAccount(tx, overtime.tenantId, "2", "Kewajiban", "2-OT", "Utang Lembur", "CREDIT");
  const details = [
    { accountId: expense.id, debit: overtime.payoutAmount, credit: 0 },
    { accountId: payable.id, debit: 0, credit: overtime.payoutAmount },
  ];
  const data = {
    date: overtime.overtimeDate,
    referenceNo: `OVERTIME-${overtime.id}`,
    description: `[AUTO] Lembur ${employee.name}${overtime.description ? ` - ${overtime.description}` : ""}`,
    createdBy: creatorId,
    status: "POSTED" as const,
  };

  if (existing) {
    await tx.journal.update({ where: { id: existing.id }, data: { ...data, details: { deleteMany: {}, create: details } } });
  } else {
    await tx.journal.create({ data: { ...data, journalNo, details: { create: details } } });
  }
}
