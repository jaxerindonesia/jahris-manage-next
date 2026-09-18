import { Prisma } from "@prisma/client";
import { splitOvertimePeriods } from "@/lib/helper/overtime-periods";

export async function completeOvertime(
  tx: Prisma.TransactionClient,
  overtimeId: string,
  endTime: Date,
  evidence: { checkOutLocation: Prisma.InputJsonValue | typeof Prisma.JsonNull; checkOutFaceImage: string; proofUrl: string | null },
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`overtime-checkout:${overtimeId}`}))`;
  const overtime = await tx.overtime.findUnique({
    where: { id: overtimeId }, include: { approvalDecisions: true },
  });
  if (!overtime || overtime.status !== "CHECKED_IN" || !overtime.startTime) return null;

  const periods = splitOvertimePeriods(overtime.startTime, endTime);
  const first = await tx.overtime.update({
    where: { id: overtime.id },
    data: { ...periods[0], ...evidence, status: "PENDING" },
  });
  for (const period of periods.slice(1)) {
    await tx.overtime.create({ data: {
      ...period,
      ...evidence,
      tenantId: overtime.tenantId,
      userId: overtime.userId,
      attendanceId: overtime.attendanceId,
      description: overtime.description,
      checkInFaceImage: overtime.checkInFaceImage,
      checkInLocation: overtime.checkInLocation ?? Prisma.JsonNull,
      status: "PENDING",
      payMethod: overtime.payMethod,
      hourlyRate: overtime.hourlyRate,
      dailyRate: overtime.dailyRate,
      payoutAmount: 0,
      approvalDecisions: { createMany: { data: overtime.approvalDecisions.map(({ approverUserId }) => ({ approverUserId, status: "PENDING" })) } },
    } });
  }
  return first;
}
