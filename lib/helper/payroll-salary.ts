import prisma from "@/lib/prisma";
import {
  isLateAttendanceStatus,
  isAbsentAttendanceStatus,
  isWorkedAttendanceStatus,
} from "@/lib/helper/attendance-status";
import type { PayrollSalarySummaryDto } from "@/lib/dto/payroll-calculation";

export async function getPayrollSalarySummary(params: {
  tenantId?: string | null;
  userId: string;
  month: number;
  year: number;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}): Promise<PayrollSalarySummaryDto & { tenantId: string | null }> {
  const { tenantId, userId, month, year, startDate: paramStart, endDate: paramEnd } = params;
  if (!userId || month < 1 || month > 12 || year < 1) {
    throw new Error("Periode payroll tidak valid");
  }
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      ...(tenantId ? { tenantId } : {}),
    },
    select: {
      salary: true,
      salaryType: true,
      tenantId: true,
    },
  });

  if (!user) {
    throw new Error("Karyawan tidak ditemukan");
  }

  const salaryRate = Number(user.salary || 0);
  const salaryType = user.salaryType === "daily" ? "daily" : "monthly";

  const rangeStart = paramStart ? new Date(paramStart) : new Date(year, month - 1, 1);
  rangeStart.setHours(0, 0, 0, 0);

  const rangeEnd = paramEnd ? new Date(paramEnd) : new Date(year, month, 1);
  if (paramEnd) {
    rangeEnd.setHours(23, 59, 59, 999);
  }

  const attendances = await prisma.attendance.findMany({
    where: {
      userId,
      attendanceDay: {
        gte: rangeStart,
        ...(paramEnd ? { lte: rangeEnd } : { lt: rangeEnd }),
      },
    },
    select: { status: true, attendanceDay: true },
  });
  const paidAttendanceDays = attendances.filter((attendance) =>
    isWorkedAttendanceStatus(attendance.status),
  ).length;
  const lateAttendanceDays = attendances.filter((attendance) =>
    isLateAttendanceStatus(attendance.status),
  ).length;
  const attendanceConfig = await prisma.attendanceConfig.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { updatedAt: "desc" },
    select: { lateDeductionAmount: true },
  });
  const lateDeductionRate = Number(attendanceConfig?.lateDeductionAmount || 0);
  const absentRates = user.tenantId
    ? await prisma.$queryRaw<Array<{ day_of_week: string; amount: number }>>`
        SELECT day_of_week, amount FROM attendance_absent_deductions
        WHERE tenant_id = ${user.tenantId}::uuid
      `
    : [];
  const rateByDay = new Map(absentRates.map((rate) => [rate.day_of_week, rate.amount]));
  const dayCodes = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const absentAttendances = attendances.filter((attendance) => isAbsentAttendanceStatus(attendance.status));
  const absentDeductionAmount = absentAttendances.reduce((total, attendance) =>
    total + (rateByDay.get(dayCodes[attendance.attendanceDay.getUTCDay()]) ?? 0), 0);

  return {
    salaryType,
    tenantId: user.tenantId,
    salaryRate,
    paidAttendanceDays: salaryType === "daily" ? paidAttendanceDays : 0,
    basicSalary:
      salaryType === "daily" ? salaryRate * paidAttendanceDays : salaryRate,
    lateDeductionRate,
    lateAttendanceDays,
    lateDeductionAmount: lateDeductionRate * lateAttendanceDays,
    absentAttendanceDays: absentAttendances.length,
    absentDeductionAmount,
  };
}
