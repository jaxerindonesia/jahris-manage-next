import prisma from "@/lib/prisma";
import { getPayrollPeriodRange, type PayrollPeriod } from "@/lib/helper/payroll-period";

export async function getApprovedOvertimePayoutSummary(params: PayrollPeriod & {
  tenantId?: string | null;
  userId: string;
}) {
  const { tenantId, userId } = params;
  const range = getPayrollPeriodRange(params);

  const aggregates = await prisma.overtime.aggregate({
    where: {
      userId,
      status: "APPROVED",
      payoutAmount: { gt: 0 },
      overtimeDate: range,
      ...(tenantId ? { tenantId } : { tenantId: null }),
    },
    _sum: {
      payoutAmount: true,
      overtimeMinutes: true,
    },
    _count: {
      id: true,
    },
  });

  return {
    totalAmount: Number(aggregates._sum.payoutAmount || 0),
    totalMinutes: Number(aggregates._sum.overtimeMinutes || 0),
    totalEntries: Number(aggregates._count.id || 0),
  };
}
