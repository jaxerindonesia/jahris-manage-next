import prisma from "@/lib/prisma";
import { getJakartaDayKey } from "@/lib/helper/date";
import { getPayrollAttendanceSummary } from "@/lib/helper/payroll-attendance";
import { getPayrollPeriodRange } from "@/lib/helper/payroll-period";
import type { PayrollDto } from "@/lib/dto/payroll";

export async function getPayrollSlipAttendance(payroll: Pick<PayrollDto,
  "userId" | "month" | "year" | "periodStartDate" | "periodEndDate"
> & { tenantId: string | null }): Promise<NonNullable<PayrollDto["attendanceSummary"]>> {
  const period = getPayrollPeriodRange({
    month: payroll.month, year: payroll.year,
    startDate: payroll.periodStartDate, endDate: payroll.periodEndDate,
  });
  const user = await prisma.user.findFirst({
    where: { id: payroll.userId, tenantId: payroll.tenantId }, select: { joinDate: true },
  });
  if (!user) throw new Error("Karyawan tidak ditemukan");
  const now = new Date();
  const joinDay = user.joinDate ? getJakartaDayKey(user.joinDate) : period.gte;
  const range = {
    gte: joinDay > period.gte ? joinDay : period.gte,
    lt: period.lt,
  };
  const attendances = range.gte < range.lt ? await prisma.attendance.findMany({
    where: { userId: payroll.userId, tenantId: payroll.tenantId, attendanceDay: range },
    select: { attendanceDay: true, status: true },
  }) : [];
  const summary = await getPayrollAttendanceSummary({
    userId: payroll.userId, tenantId: payroll.tenantId, range, attendances, now,
  });
  return { absentDays: summary.absentDays.length, submissionDays: summary.submissionDays };
}
