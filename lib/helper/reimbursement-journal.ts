import type { Prisma, Reimbursement } from "@prisma/client";

export const REIMBURSEMENT_JOURNAL_PREFIX = "AUTO-RBM-";

export async function lockReimbursementJournal(tx: Prisma.TransactionClient, tenantId: string | null) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reimbursement-journal:${tenantId ?? "global"}`}))`;
}

async function getReimbursementAccount(
  tx: Prisma.TransactionClient, tenantId: string | null, categoryCode: string,
  categoryName: string, code: string, name: string, normalBalance: "DEBIT" | "CREDIT",
) {
  let category = await tx.accountCategory.findFirst({ where: { tenantId, code: categoryCode } });
  if (!category) category = await tx.accountCategory.create({ data: { tenantId, code: categoryCode, name: categoryName } });
  const existing = await tx.account.findFirst({ where: { tenantId, code } });
  if (existing) {
    if (!existing.isActive || existing.accountCategoryId !== category.id || existing.normalBalance !== normalBalance) {
      throw new Error(`Konfigurasi akun ${code} tidak sesuai untuk jurnal reimbursement`);
    }
    return existing;
  }
  return tx.account.create({ data: { tenantId, accountCategoryId: category.id, code, name, normalBalance } });
}

// Caller holds the tenant lock and updates the reimbursement in the same transaction.
export async function syncReimbursementJournal(tx: Prisma.TransactionClient, claim: Reimbursement) {
  const journalNo = `${REIMBURSEMENT_JOURNAL_PREFIX}${claim.id}`;
  const existing = await tx.journal.findUnique({ where: { journalNo } });
  if (claim.status.toUpperCase() !== "APPROVED") {
    if (existing) await tx.journal.update({ where: { id: existing.id }, data: { status: "VOID" } });
    return;
  }
  if (!Number.isFinite(claim.amount) || claim.amount <= 0) throw new Error("Nominal reimbursement harus lebih dari nol");

  // Preserve historical auto journals instead of posting the same claim twice.
  const legacy = await tx.journal.findFirst({ where: {
    journalNo: { not: journalNo },
    referenceNo: { in: [`REIMBURSEMENT-${claim.id}`, `REIMBURSEMENT-${claim.referenceNumber ?? claim.id}`] },
    creator: { tenantId: claim.tenantId },
    status: { not: "VOID" },
  } });
  if (legacy) return;

  const employee = await tx.user.findFirst({ where: { id: claim.userId, tenantId: claim.tenantId }, select: { id: true, name: true } });
  if (!employee) throw new Error("Tenant karyawan tidak sesuai dengan reimbursement");
  const approver = claim.approvedBy
    ? await tx.user.findFirst({ where: { id: claim.approvedBy, tenantId: claim.tenantId }, select: { id: true } })
    : null;
  const expense = await getReimbursementAccount(tx, claim.tenantId, "5", "Beban", "5-RBM", "Beban Reimbursement", "DEBIT");
  const payable = await getReimbursementAccount(tx, claim.tenantId, "2", "Kewajiban", "2-RBM", "Utang Reimbursement", "CREDIT");
  const details = [
    { accountId: expense.id, debit: claim.amount, credit: 0 },
    { accountId: payable.id, debit: 0, credit: claim.amount },
  ];
  const data = {
    date: claim.date,
    referenceNo: `REIMBURSEMENT-${claim.referenceNumber ?? claim.id}`,
    description: `[AUTO] Reimbursement ${employee.name} - ${claim.title}`,
    createdBy: approver?.id ?? employee.id,
    status: "POSTED" as const,
  };
  if (existing) {
    await tx.journal.update({ where: { id: existing.id }, data: {
      ...data, details: { deleteMany: {}, create: details },
    } });
  } else {
    await tx.journal.create({ data: { ...data, journalNo, details: { create: details } } });
  }
}
