import type { PrismaClient } from "@prisma/client";
import { getJakartaDayKey } from "@/lib/helper/date";

export const WORK_DAY_CODES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

export type ResolvedWorkSchedule = {
  source: "REGULAR" | "SHIFT";
  branchId: string;
  workDate: Date;
  startAt: Date;
  endAt: Date;
  isWorkingDay: boolean;
  lateToleranceMinutes: number;
  shiftId?: string;
  shiftName?: string;
};

type SchedulePrisma = Pick<
  PrismaClient,
  "branch" | "branchWorkingSchedule" | "employeeShiftSchedule" | "attendanceConfig"
>;

function jakartaDateAtTime(workDate: Date, time: string, addDay = false) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(
    Date.UTC(
      workDate.getUTCFullYear(),
      workDate.getUTCMonth(),
      workDate.getUTCDate() + (addDay ? 1 : 0),
      (hours || 0) - 7,
      minutes || 0,
    ),
  );
}

async function getTenantLateTolerance(prisma: SchedulePrisma, tenantId: string) {
  const config = await prisma.attendanceConfig.findFirst({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    select: { lateToleranceMinutes: true },
  });
  return config?.lateToleranceMinutes ?? 15;
}

export async function getScheduledWorkDays(
  prisma: SchedulePrisma,
  userId: string,
  range: { gte: Date; lt: Date },
) {
  const branch = await prisma.branch.findFirst({
    where: { users: { some: { id: userId } }, isActive: true },
    select: { id: true, scheduleType: true, workingSchedules: true },
  });
  if (!branch) return [];

  if (branch.scheduleType === "SHIFT") {
    const assignments = await prisma.employeeShiftSchedule.findMany({
      where: { userId, branchId: branch.id, workDate: range, isDayOff: false, shift: { isActive: true } },
      select: { workDate: true, shift: { select: { endTime: true, crossesMidnight: true } } },
    });
    return assignments.flatMap(({ workDate, shift }) => shift ? [{
      workDate,
      endAt: jakartaDateAtTime(workDate, shift.endTime, shift.crossesMidnight),
    }] : []);
  }

  const schedules = new Map(branch.workingSchedules.map((schedule) => [schedule.dayOfWeek, schedule]));
  const days = [];
  for (let day = new Date(range.gte); day < range.lt; day.setUTCDate(day.getUTCDate() + 1)) {
    const schedule = schedules.get(WORK_DAY_CODES[day.getUTCDay()]);
    if (!schedule?.isWorkDay || !schedule.startTime || !schedule.endTime) continue;
    days.push({
      workDate: new Date(day),
      endAt: jakartaDateAtTime(day, schedule.endTime, schedule.endTime <= schedule.startTime),
    });
  }
  return days;
}

export async function resolveWorkSchedule(
  prisma: SchedulePrisma,
  userId: string,
  referenceDate = new Date(),
): Promise<ResolvedWorkSchedule | null> {
  const workDate = getJakartaDayKey(referenceDate);
  const branch = await prisma.branch.findFirst({
    where: { users: { some: { id: userId } }, isActive: true },
    select: { id: true, tenantId: true, scheduleType: true },
  });
  if (!branch) return null;

  const defaultTolerance = await getTenantLateTolerance(prisma, branch.tenantId);
  if (branch.scheduleType === "SHIFT") {
    const assignment = await prisma.employeeShiftSchedule.findUnique({
      where: { userId_workDate: { userId, workDate } },
      include: { shift: true },
    });
    if (!assignment || assignment.isDayOff || !assignment.shift?.isActive || assignment.branchId !== branch.id) return null;

    return {
      source: "SHIFT",
      branchId: branch.id,
      workDate,
      startAt: jakartaDateAtTime(workDate, assignment.shift.startTime),
      endAt: jakartaDateAtTime(
        workDate,
        assignment.shift.endTime,
        assignment.shift.crossesMidnight,
      ),
      isWorkingDay: true,
      lateToleranceMinutes:
        assignment.shift.lateToleranceMinutes ?? defaultTolerance,
      shiftId: assignment.shiftId ?? undefined,
      shiftName: assignment.shift.name,
    };
  }

  const dayOfWeek = WORK_DAY_CODES[workDate.getUTCDay()];
  const regular = await prisma.branchWorkingSchedule.findUnique({
    where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek } },
  });
  if (!regular?.isWorkDay || !regular.startTime || !regular.endTime) return null;

  const crossesMidnight = regular.endTime <= regular.startTime;
  return {
    source: "REGULAR",
    branchId: branch.id,
    workDate,
    startAt: jakartaDateAtTime(workDate, regular.startTime),
    endAt: jakartaDateAtTime(workDate, regular.endTime, crossesMidnight),
    isWorkingDay: true,
    lateToleranceMinutes: defaultTolerance,
  };
}

export async function resolveActiveWorkSchedule(
  prisma: SchedulePrisma,
  userId: string,
  referenceDate = new Date(),
) {
  const today = await resolveWorkSchedule(prisma, userId, referenceDate);
  const yesterday = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
  const previous = await resolveWorkSchedule(prisma, userId, yesterday);
  if (previous && previous.endAt > referenceDate) return previous;
  return today;
}
