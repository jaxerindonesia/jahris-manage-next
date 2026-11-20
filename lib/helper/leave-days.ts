import type { PrismaClient } from "@prisma/client";
import { getJakartaDayKey } from "@/lib/helper/date";
import { getNationalHolidaysByYears } from "@/lib/helper/holiday";
import { WORK_DAY_CODES } from "@/lib/helper/work-schedule";

type LeaveDaysPrisma = Pick<PrismaClient, "user" | "employeeShiftSchedule">;

type DateRange = { startDate: Date; endDate: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

const toDayKey = (date: Date) => getJakartaDayKey(date).toISOString().slice(0, 10);

/**
 * Builds a counter for leave days of one user, following the user's branch:
 * - REGULAR branch: only days marked as work days in BranchWorkingSchedule.
 * - SHIFT branch: every day except days explicitly marked as day off
 *   (future shift schedules may not exist yet when leave is requested).
 * National holidays are always excluded. Without a branch/schedule, all
 * calendar days except national holidays are counted.
 */
export async function createLeaveDayCounter(
  prisma: LeaveDaysPrisma,
  userId: string,
  bounds: DateRange,
) {
  const boundStart = getJakartaDayKey(bounds.startDate);
  const boundEnd = getJakartaDayKey(bounds.endDate);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      branch: {
        select: {
          id: true,
          isActive: true,
          scheduleType: true,
          workingSchedules: { select: { dayOfWeek: true, isWorkDay: true } },
        },
      },
    },
  });
  const branch = user?.branch?.isActive ? user.branch : null;

  const years: number[] = [];
  for (let y = boundStart.getUTCFullYear(); y <= boundEnd.getUTCFullYear(); y++) years.push(y);
  const holidayKeys = new Set<string>();
  try {
    const holidays = await getNationalHolidaysByYears(years);
    holidays.forEach((holiday) => holidayKeys.add(holiday.date));
  } catch (error) {
    console.warn("LEAVE DAYS: national holidays unavailable, counting without them", error);
  }

  let isWorkDay: (day: Date) => boolean = () => true;
  if (branch?.scheduleType === "SHIFT") {
    const dayOffs = await prisma.employeeShiftSchedule.findMany({
      where: { userId, branchId: branch.id, isDayOff: true, workDate: { gte: boundStart, lte: boundEnd } },
      select: { workDate: true },
    });
    const dayOffKeys = new Set(dayOffs.map((d) => d.workDate.toISOString().slice(0, 10)));
    isWorkDay = (day) => !dayOffKeys.has(day.toISOString().slice(0, 10));
  } else if (branch && branch.workingSchedules.length > 0) {
    const workDays = new Set(
      branch.workingSchedules.filter((s) => s.isWorkDay).map((s) => s.dayOfWeek),
    );
    isWorkDay = (day) => workDays.has(WORK_DAY_CODES[day.getUTCDay()]);
  }

  return (range: DateRange) => {
    const start = new Date(Math.max(getJakartaDayKey(range.startDate).getTime(), boundStart.getTime()));
    const end = new Date(Math.min(getJakartaDayKey(range.endDate).getTime(), boundEnd.getTime()));
    let count = 0;
    for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
      const day = new Date(t);
      if (holidayKeys.has(toDayKey(day))) continue;
      if (isWorkDay(day)) count++;
    }
    return count;
  };
}
