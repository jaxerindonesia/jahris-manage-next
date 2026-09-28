import prisma from "@/lib/prisma";

export async function getApprovedOvertimePayoutSummary(params: {
  tenantId?: string | null;
  userId: string;
  month: number;
  year: number;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}) {
  const { tenantId, userId, month, year, startDate: paramStart, endDate: paramEnd } = params;
  const rangeStart = paramStart ? new Date(paramStart) : new Date(year, month - 1, 1);
  rangeStart.setHours(0, 0, 0, 0);

  const rangeEnd = paramEnd ? new Date(paramEnd) : new Date(year, month, 1);
  if (paramEnd) {
    rangeEnd.setHours(23, 59, 59, 999);
  }

  const aggregates = await prisma.overtime.aggregate({
    where: {
      userId,
      status: "APPROVED",
      payoutAmount: { gt: 0 },
      overtimeDate: {
        gte: rangeStart,
        ...(paramEnd ? { lte: rangeEnd } : { lt: rangeEnd }),
      },
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
