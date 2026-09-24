import type { PettyCash, Prisma } from "@prisma/client";

export const PETTY_CASH_JOURNAL_PREFIX = "AUTO-PC-";

export async function lockPettyCashJournal(tx: Prisma.TransactionClient, tenantId: string | null) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`petty-cash-journal:${tenantId ?? "global"}`}))`;
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
      throw new Error(`Konfigurasi akun ${code} tidak sesuai untuk jurnal petty cash`);
    }
    return existing;
  }

  return tx.account.create({ data: { tenantId, accountCategoryId: category.id, code, name, normalBalance } });
}

async function upsertJournal(
  tx: Prisma.TransactionClient,
  journalNo: string,
  data: Prisma.JournalUncheckedCreateInput,
  details: Prisma.JournalDetailUncheckedCreateWithoutJournalInput[],
) {
  const existing = await tx.journal.findUnique({ where: { journalNo }, select: { id: true } });
  if (existing) {
    await tx.journal.update({
      where: { id: existing.id },
      data: { ...data, details: { deleteMany: {}, create: details } },
    });
    return;
  }
  await tx.journal.create({ data: { ...data, details: { create: details } } });
}

export async function syncPettyCashJournals(
  tx: Prisma.TransactionClient,
  pettyCash: PettyCash,
  creatorId: string,
) {
  const active = ["TRANSFER", "SETTLE"].includes(pettyCash.status.toUpperCase());
  const fundJournalNo = `${PETTY_CASH_JOURNAL_PREFIX}FUND-${pettyCash.id}`;
  const usages = await tx.pettyCashUsage.findMany({ where: { pettyCashId: pettyCash.id } });

  if (!active) {
    await tx.journal.updateMany({
      where: { journalNo: { in: [fundJournalNo, ...usages.map((usage) => `${PETTY_CASH_JOURNAL_PREFIX}USE-${usage.id}`)] } },
      data: { status: "VOID" },
    });
    return;
  }
  if (!Number.isFinite(pettyCash.amount) || pettyCash.amount <= 0) throw new Error("Nominal petty cash harus lebih dari nol");

  const cash = await getAccount(tx, pettyCash.tenantId, "1", "Aset", "1-PC", "Kas Kecil", "DEBIT");
  const bank = await getAccount(tx, pettyCash.tenantId, "1", "Aset", "1-BANK-PC", "Bank Petty Cash", "DEBIT");
  const expense = await getAccount(tx, pettyCash.tenantId, "5", "Beban", "5-PC", "Beban Petty Cash", "DEBIT");
  const employee = await tx.user.findFirst({
    where: { id: pettyCash.userId, tenantId: pettyCash.tenantId },
    select: { name: true },
  });
  if (!employee) throw new Error("Tenant karyawan tidak sesuai dengan petty cash");

  await upsertJournal(tx, fundJournalNo, {
    journalNo: fundJournalNo,
    date: pettyCash.transferDate ?? pettyCash.updatedAt,
    referenceNo: `PETTYCASH-${pettyCash.id}`,
    description: `[AUTO] Transfer petty cash ${employee.name} - ${pettyCash.purpose}`,
    createdBy: creatorId,
    status: "POSTED",
  }, [
    { accountId: cash.id, debit: pettyCash.amount, credit: 0 },
    { accountId: bank.id, debit: 0, credit: pettyCash.amount },
  ]);

  for (const usage of usages) {
    if (!Number.isFinite(usage.amount) || usage.amount <= 0) throw new Error("Nominal pemakaian petty cash harus lebih dari nol");
    const transactionType = usage.transactionType.toUpperCase();
    const journalNo = `${PETTY_CASH_JOURNAL_PREFIX}USE-${usage.id}`;
    const isTopUp = transactionType === "TOP_UP";
    const isReturn = transactionType === "RETURN";
    await upsertJournal(tx, journalNo, {
      journalNo,
      date: usage.usageDate,
      referenceNo: `PETTYCASH-USAGE-${usage.id}`,
      description: `[AUTO] ${isTopUp ? "Tambahan dana" : isReturn ? "Pengembalian dana" : "Pemakaian petty cash"} ${employee.name} - ${usage.description}`,
      createdBy: creatorId,
      status: "POSTED",
    }, isTopUp ? [
      { accountId: cash.id, debit: usage.amount, credit: 0 },
      { accountId: bank.id, debit: 0, credit: usage.amount },
    ] : isReturn ? [
      { accountId: bank.id, debit: usage.amount, credit: 0 },
      { accountId: cash.id, debit: 0, credit: usage.amount },
    ] : [
      { accountId: expense.id, debit: usage.amount, credit: 0 },
      { accountId: cash.id, debit: 0, credit: usage.amount },
    ]);
  }
}
