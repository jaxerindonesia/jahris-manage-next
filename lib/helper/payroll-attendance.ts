import prisma from "@/lib/prisma";
import { getJakartaDayKey, getJakartaDayRange } from "@/lib/helper/date";
import { getNationalHolidaysByYears } from "@/lib/helper/holiday";
import { isWorkedAttendanceStatus, normalizeAttendanceStatus } from "@/lib/helper/attendance-status";
import { getScheduledWorkDays } from "@/lib/helper/work-schedule";

export async function getPayrollAbsentDays(params: {
  userId: string;
  tenantId: string | null;
  range: { gte: Date; lt: Date };
  attendances: { attendanceDay: Date; status: string }[];
  now: Date;
}) {
  const { userId, tenantId, range, attendances, now } = params;
  if (range.gte >= range.lt) return [];
  const schedules = await getScheduledWorkDays(prisma, userId, range);
  const completedDays = schedules.filter((day) => day.endAt <= now);
  if (!completedDays.length) return [];

  const years = [...new Set(completedDays.map((day) => day.workDate.getUTCFullYear()))];
  const [holidays, submissions, submissionTypes] = await Promise.all([
    getNationalHolidaysByYears(years),
    prisma.submission.findMany({
      where: {
        userId, tenantId, status: "APPROVED", deletedAt: null,
        startDate: { lt: getJakartaDayRange(range.lt).startUtc },
        endDate: { gte: getJakartaDayRange(range.gte).startUtc },
      },
      select: { startDate: true, endDate: true },
    }),
    prisma.submissionType.findMany({ where: { tenantId }, select: { name: true } }),
  ]);

  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const excusedStatuses = new Set(submissionTypes.map((type) => normalizeAttendanceStatus(type.name)));
  const attendanceByDate = new Map(attendances.map((attendance) => [attendance.attendanceDay.toISOString().slice(0, 10), attendance]));
  const approvedRanges = submissions.map((submission) => ({
    start: getJakartaDayKey(submission.startDate),
    end: getJakartaDayKey(submission.endDate),
  }));

  return completedDays.flatMap(({ workDate }) => {
    const dateKey = workDate.toISOString().slice(0, 10);
    const attendance = attendanceByDate.get(dateKey);
    if (holidayDates.has(dateKey) || isWorkedAttendanceStatus(attendance?.status)) return [];
    if (attendance && excusedStatuses.has(normalizeAttendanceStatus(attendance.status))) return [];
    if (approvedRanges.some(({ start, end }) => start <= workDate && end >= workDate)) return [];
    return [workDate];
  });
}
