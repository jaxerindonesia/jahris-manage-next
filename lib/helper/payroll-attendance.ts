import prisma from "@/lib/prisma";
import { getJakartaDayKey, getJakartaDayRange } from "@/lib/helper/date";
import { getNationalHolidaysByYears } from "@/lib/helper/holiday";
import { isWorkedAttendanceStatus, normalizeAttendanceStatus } from "@/lib/helper/attendance-status";
import { getScheduledWorkDays } from "@/lib/helper/work-schedule";

export async function getPayrollAttendanceSummary(params: {
  userId: string;
  tenantId: string | null;
  range: { gte: Date; lt: Date };
  attendances: { attendanceDay: Date; status: string }[];
  now: Date;
}) {
  const { userId, tenantId, range, attendances, now } = params;
  const submissionTypes = await prisma.submissionType.findMany({
    where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const submissionDays = submissionTypes.map((type) => ({ name: type.name, days: 0, calendarDays: 0 }));
  const empty = { absentDays: [] as Date[], submissionDays };
  if (range.gte >= range.lt) return empty;
  const schedules = await getScheduledWorkDays(prisma, userId, range);
  const completedDays = schedules.filter((day) => day.endAt <= now);

  const years = [...new Set(schedules.map((day) => day.workDate.getUTCFullYear()))];
  const [holidays, submissions] = await Promise.all([
    getNationalHolidaysByYears(years),
    prisma.submission.findMany({
      where: {
        userId, tenantId, status: "APPROVED", deletedAt: null,
        startDate: { lt: getJakartaDayRange(range.lt).startUtc },
        endDate: { gte: getJakartaDayRange(range.gte).startUtc },
      },
      select: { startDate: true, endDate: true, submissionTypeId: true },
      orderBy: [{ approvedAt: "desc" }, { id: "asc" }],
    }),
  ]);

  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const excusedStatuses = new Set(submissionTypes.map((type) => normalizeAttendanceStatus(type.name)));
  const attendanceByDate = new Map(attendances.map((attendance) => [attendance.attendanceDay.toISOString().slice(0, 10), attendance]));
  const approvedRanges = submissions.map((submission) => ({
    typeId: submission.submissionTypeId,
    start: getJakartaDayKey(submission.startDate),
    end: getJakartaDayKey(submission.endDate),
  }));

  // Keep the approved date span visible alongside absence on scheduled workdays.
  for (const day = new Date(range.gte); day < range.lt; day.setUTCDate(day.getUTCDate() + 1)) {
    const approved = approvedRanges.find(({ start, end }) => start <= day && end >= day);
    if (!approved) continue;
    const index = submissionTypes.findIndex((type) => type.id === approved.typeId);
    if (index >= 0) submissionDays[index].calendarDays += 1;
  }

  for (const { workDate } of schedules) {
    const dateKey = workDate.toISOString().slice(0, 10);
    if (holidayDates.has(dateKey) || isWorkedAttendanceStatus(attendanceByDate.get(dateKey)?.status)) continue;
    const approved = approvedRanges.find(({ start, end }) => start <= workDate && end >= workDate);
    if (!approved) continue;
    const index = submissionTypes.findIndex((type) => type.id === approved.typeId);
    if (index >= 0) submissionDays[index].days += 1;
  }

  const absentDays = completedDays.flatMap(({ workDate }) => {
    const dateKey = workDate.toISOString().slice(0, 10);
    const attendance = attendanceByDate.get(dateKey);
    if (holidayDates.has(dateKey) || isWorkedAttendanceStatus(attendance?.status)) return [];
    const approved = approvedRanges.find(({ start, end }) => start <= workDate && end >= workDate);
    if (approved) return [];
    if (attendance && excusedStatuses.has(normalizeAttendanceStatus(attendance.status))) return [];
    return [workDate];
  });
  return { absentDays, submissionDays };
}

export async function getPayrollAbsentDays(params: Parameters<typeof getPayrollAttendanceSummary>[0]) {
  return (await getPayrollAttendanceSummary(params)).absentDays;
}
