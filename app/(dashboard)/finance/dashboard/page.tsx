import FinanceDashboardPage from "./components/finance-dashboard-page";
import type { AccountCategoryDto } from "@/lib/dto/finance-account-category";
import { requirePermission } from "@/lib/auth/permission";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { REIMBURSEMENT_JOURNAL_PREFIX } from "@/lib/helper/reimbursement-journal";
import { PETTY_CASH_JOURNAL_PREFIX } from "@/lib/helper/petty-cash-journal";
import { OVERTIME_JOURNAL_PREFIX } from "@/lib/helper/overtime-journal";
import { PAYROLL_JOURNAL_PREFIX } from "@/lib/helper/payroll-journal";
import prisma from "@/lib/prisma";

type DashboardAccount = {
  id: string;
  code: string;
  name: string;
  accountCategory: Pick<AccountCategoryDto, "code" | "name"> | null;
};

function getMonthKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function buildTopAccounts(
  accounts: DashboardAccount[],
  accountBalanceMap: Map<string, number>,
  matcher: (account: DashboardAccount) => boolean,
  valueFormatter: (balance: number) => number,
) {
  return accounts
    .filter(matcher)
    .map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      amount: valueFormatter(accountBalanceMap.get(account.id) ?? 0),
    }))
    .filter((account) => account.amount > 0)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);
}

export default async function FinanceDashboardRoute() {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "finance", "get-all");
  if (forbid) return forbid;
  const scopedTenantId = ensureTenantScope(auth.user);
  const summary = await (async () => {
      const accountWhere = scopedTenantId ? { tenantId: scopedTenantId } : {};
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

      const [accountCount, journalCount, postedJournalCount, draftJournalCount, journals, statusGroup, accounts] =
        await Promise.all([
          prisma.account.count({ where: accountWhere }),
          prisma.journal.count({ where: journalWhere }),
          prisma.journal.count({ where: { ...journalWhere, status: "POSTED" } }),
          prisma.journal.count({ where: { ...journalWhere, status: "DRAFT" } }),
          prisma.journal.findMany({
            where: { ...journalWhere, status: "POSTED" },
            select: {
              date: true,
              details: { select: { debit: true, credit: true } },
            },
          }),
          prisma.journal.groupBy({
            by: ["status"],
            where: journalWhere,
            _count: { status: true },
          }),
          prisma.account.findMany({
            where: accountWhere,
            select: {
              id: true,
              code: true,
              name: true,
              accountCategory: { select: { code: true, name: true } },
            },
          }),
        ]);

      const monthlyMap = new Map<string, { debit: number; credit: number }>();
      const accountBalanceMap = new Map<string, number>();
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

      for (const account of accounts) {
        accountBalanceMap.set(account.id, 0);
      }

      const postedDetails = await prisma.journalDetail.findMany({
        where: {
          journal: {
            ...journalWhere,
            status: "POSTED",
          },
          ...(scopedTenantId ? { account: { tenantId: scopedTenantId } } : {}),
        },
        select: {
          accountId: true,
          debit: true,
          credit: true,
        },
      });

      for (const detail of postedDetails) {
        const signed = Number(detail.debit || 0) - Number(detail.credit || 0);
        accountBalanceMap.set(detail.accountId, (accountBalanceMap.get(detail.accountId) ?? 0) + signed);
      }

      const getAccountBalanceByMatch = (matchers: RegExp[], categoryCodes: string[]) =>
        accounts.reduce((sum, account) => {
          const categoryCode = account.accountCategory?.code ?? "";
          const isCategoryMatch = categoryCodes.includes(categoryCode);
          const isNameMatch = matchers.some((matcher) => matcher.test(`${account.code} ${account.name}`));
          if (!isCategoryMatch || !isNameMatch) return sum;
          return sum + (accountBalanceMap.get(account.id) ?? 0);
        }, 0);

      const cashBankBalance = getAccountBalanceByMatch([/cash/i, /bank/i, /kas/i, /petty cash/i], ["1"]);
      const receivableBalance = getAccountBalanceByMatch([/receivable/i, /piutang/i], ["1"]);
      const payableBalance = -getAccountBalanceByMatch([/payable/i, /utang/i], ["2"]);
      const revenueBalance = accounts.reduce((sum, account) => {
        if ((account.accountCategory?.code ?? "") !== "4") return sum;
        return sum + (accountBalanceMap.get(account.id) ?? 0);
      }, 0);
      const expenseBalance = accounts.reduce((sum, account) => {
        if ((account.accountCategory?.code ?? "") !== "5") return sum;
        return sum + (accountBalanceMap.get(account.id) ?? 0);
      }, 0);
      const profitLossBalance = -revenueBalance - expenseBalance;

      return {
        accountCount,
        journalCount,
        postedJournalCount,
        draftJournalCount,
        totalDebit,
        totalCredit,
        revenueBalance,
        cashBankBalance,
        receivableBalance,
        payableBalance,
        profitLossBalance,
        topRevenueAccounts: buildTopAccounts(
          accounts,
          accountBalanceMap,
          (account) => (account.accountCategory?.code ?? "") === "4",
          (balance) => Math.abs(balance),
        ),
        topReceivableAccounts: buildTopAccounts(
          accounts,
          accountBalanceMap,
          (account) =>
            (account.accountCategory?.code ?? "") === "1" &&
            [/receivable/i, /piutang/i].some((matcher) => matcher.test(`${account.code} ${account.name}`)),
          (balance) => Math.max(balance, 0),
        ),
        topPayableAccounts: buildTopAccounts(
          accounts,
          accountBalanceMap,
          (account) =>
            (account.accountCategory?.code ?? "") === "2" &&
            [/payable/i, /utang/i].some((matcher) => matcher.test(`${account.code} ${account.name}`)),
          (balance) => Math.abs(Math.min(balance, 0)),
        ),
        topExpenseAccounts: buildTopAccounts(
          accounts,
          accountBalanceMap,
          (account) => (account.accountCategory?.code ?? "") === "5",
          (balance) => Math.max(balance, 0),
        ),
        monthlyTrend: Array.from(monthlyMap.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .slice(-6)
          .map(([month, value]) => ({ month, ...value })),
        statusBreakdown: statusGroup.map((item) => ({
          status: item.status,
          total: item._count.status,
        })),
      };
    })();

  return <FinanceDashboardPage summary={summary} />;
}
