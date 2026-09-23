export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { REIMBURSEMENT_JOURNAL_PREFIX } from "@/lib/helper/reimbursement-journal";
import { PETTY_CASH_JOURNAL_PREFIX } from "@/lib/helper/petty-cash-journal";
import { OVERTIME_JOURNAL_PREFIX } from "@/lib/helper/overtime-journal";
import { PAYROLL_JOURNAL_PREFIX } from "@/lib/helper/payroll-journal";

function getMonthKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

export async function GET() {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "finance", "get-all");
  if (forbid) return forbid;
  const scopedTenantId = ensureTenantScope(auth.user);
  const journalWhere = {
    ...(scopedTenantId ? { creator: { tenantId: scopedTenantId } } : {}),
    NOT: {
      OR: [
        { journalNo: { startsWith: REIMBURSEMENT_JOURNAL_PREFIX } },
        { journalNo: { startsWith: PETTY_CASH_JOURNAL_PREFIX } },
        { journalNo: { startsWith: OVERTIME_JOURNAL_PREFIX } },
        { journalNo: { startsWith: PAYROLL_JOURNAL_PREFIX } },
      ],
    },
  };

  const [accountCount, journalCount, postedJournalCount, draftJournalCount, journals, statusGroup] =
    await Promise.all([
      prisma.account.count({ where: scopedTenantId ? { tenantId: scopedTenantId } : {} }),
      prisma.journal.count({ where: journalWhere }),
      prisma.journal.count({ where: { ...journalWhere, status: "POSTED" } }),
      prisma.journal.count({ where: { ...journalWhere, status: "DRAFT" } }),
      prisma.journal.findMany({
        where: journalWhere,
        select: {
          date: true,
          status: true,
          details: { select: { debit: true, credit: true } },
        },
      }),
      prisma.journal.groupBy({
        by: ["status"],
        where: journalWhere,
        _count: { status: true },
      }),
    ]);

  const monthlyMap = new Map<string, { debit: number; credit: number }>();
  let totalDebit = 0;
  let totalCredit = 0;

  for (const journal of journals) {
    const monthKey = getMonthKey(journal.date);
    const current = monthlyMap.get(monthKey) ?? { debit: 0, credit: 0 };
    const debit = journal.details.reduce((sum, item) => sum + Number(item.debit || 0), 0);
    const credit = journal.details.reduce((sum, item) => sum + Number(item.credit || 0), 0);
    current.debit += debit;
    current.credit += credit;
    totalDebit += debit;
    totalCredit += credit;
    monthlyMap.set(monthKey, current);
  }

  const monthlyTrend = Array.from(monthlyMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-6)
    .map(([month, value]) => ({ month, ...value }));

  return NextResponse.json({
    data: {
      accountCount,
      journalCount,
      postedJournalCount,
      draftJournalCount,
      totalDebit,
      totalCredit,
      monthlyTrend,
      statusBreakdown: statusGroup.map((item) => ({
        status: item.status,
        total: item._count.status,
      })),
    },
  });
}
