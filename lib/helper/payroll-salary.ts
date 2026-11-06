import prisma from "@/lib/prisma";
import {
  isLateAttendanceStatus,
  isWorkedAttendanceStatus,
} from "@/lib/helper/attendance-status";
import type { PayrollSalarySummaryDto } from "@/lib/dto/payroll-calculation";
import { getPayrollPeriodRange, type PayrollPeriod } from "@/lib/helper/payroll-period";
import { WORK_DAY_CODES } from "@/lib/helper/work-schedule";
import { getJakartaDayKey } from "@/lib/helper/date";
import { getPayrollAbsentDays } from "@/lib/helper/payroll-attendance";

export async function getPayrollSalarySummary(params: PayrollPeriod & {
  tenantId?: string | null;
  userId: string;
  now?: Date;
}): Promise<PayrollSalarySummaryDto & { tenantId: string | null }> {
  const { tenantId, userId } = params;
  const range = getPayrollPeriodRange(params);
  if (!userId) throw new Error("Karyawan wajib dipilih");
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      ...(tenantId ? { tenantId } : {}),
    },
    select: {
      salary: true,
      salaryType: true,
      tenantId: true,
      joinDate: true,
    },
  });

  if (!user) {
    throw new Error("Karyawan tidak ditemukan");
  }

  const salaryRate = Number(user.salary || 0);
  const salaryType = user.salaryType === "daily" ? "daily" : "monthly";
  const now = params.now ?? new Date();
  const tomorrow = getJakartaDayKey(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const joinDay = user.joinDate ? getJakartaDayKey(user.joinDate) : range.gte;
  const attendanceRange = {
    gte: joinDay > range.gte ? joinDay : range.gte,
    lt: tomorrow < range.lt ? tomorrow : range.lt,
  };

  const attendances = attendanceRange.gte < attendanceRange.lt ? await prisma.attendance.findMany({
    where: {
      userId,
      tenantId: user.tenantId,
      attendanceDay: attendanceRange,
    },
    select: { status: true, attendanceDay: true },
  }) : [];
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
  const absentRates = user.tenantId && salaryType === "monthly"
    ? await prisma.$queryRaw<Array<{ day_of_week: string; amount: number }>>`
        SELECT day_of_week, amount FROM attendance_absent_deductions
        WHERE tenant_id = ${user.tenantId}::uuid
      `
    : [];
  const rateByDay = new Map(absentRates.map((rate) => [rate.day_of_week, rate.amount]));
  const absentDays = await getPayrollAbsentDays({ userId, tenantId: user.tenantId, range: attendanceRange, attendances, now });
  const absentDeductionAmount = salaryType === "daily" ? 0 : absentDays.reduce((total, day) =>
    total + (rateByDay.get(WORK_DAY_CODES[day.getUTCDay()]) ?? 0), 0);

  return {
    salaryType,
    tenantId: user.tenantId,
    salaryRate,
    paidAttendanceDays,
    basicSalary:
      salaryType === "daily" ? salaryRate * paidAttendanceDays : salaryRate,
    lateDeductionRate,
    lateAttendanceDays,
    lateDeductionAmount: lateDeductionRate * lateAttendanceDays,
    absentAttendanceDays: absentDays.length,
    absentDeductionAmount,
  };
}
