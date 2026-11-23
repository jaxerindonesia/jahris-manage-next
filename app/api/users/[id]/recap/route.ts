export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission } from "@/lib/auth/permission";
import {
  isAbsentAttendanceStatus,
  isLateAttendanceStatus,
  normalizeAttendanceStatus,
  isWorkedAttendanceStatus,
} from "@/lib/helper/attendance-status";
import { createLeaveDayCounter } from "@/lib/helper/leave-days";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(req: Request, { params }: Params) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const scopedTenantId = ensureTenantScope(auth.user);

    const { id } = await params;
    const canReadOtherUsers =
      hasPermission(auth.user, "users", "get-by-id") ||
      hasPermission(auth.user, "attendances", "get-all");
    if (!canReadOtherUsers && id !== auth.user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const requestedStart = searchParams.get("startDate");
    const requestedEnd = searchParams.get("endDate");
    const isRange = requestedStart !== null || requestedEnd !== null;
    const parseDate = (value: string | null) => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
    };
    const rangeStart = isRange ? parseDate(requestedStart) : null;
    const rangeEnd = isRange ? parseDate(requestedEnd) : null;
    if ((isRange && (!rangeStart || !rangeEnd || rangeStart > rangeEnd)) ||
        (!isRange && (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)))) {
      return NextResponse.json({ message: "Periode rekap tidak valid" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const startDate = rangeStart ?? new Date(year, month - 1, 1);
    const endDate = rangeEnd
      ? new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000 - 1)
      : new Date(year, month, 0, 23, 59, 59, 999);
    const recapYear = rangeEnd?.getUTCFullYear() ?? year;

    const [attendances, submissionTypes] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          userId: id,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: "asc" },
      }),
      prisma.submissionType.findMany({
        where: scopedTenantId ? { tenantId: scopedTenantId } : {},
        select: { name: true },
      }),
    ]);

    const submissionTypeStatusSet = new Set(
      submissionTypes.map((submissionType) =>
        normalizeAttendanceStatus(submissionType.name),
      ),
    );

    const summary = {
      totalHadir: 0,
      totalTelat: 0,
      totalAlpha: 0,
      totalIzin: 0,
    };

    attendances.forEach((att) => {
      if (isWorkedAttendanceStatus(att.status)) {
        summary.totalHadir++;
        if (isLateAttendanceStatus(att.status)) summary.totalTelat++;
      } else if (isAbsentAttendanceStatus(att.status)) {
        summary.totalAlpha++;
      } else if (submissionTypeStatusSet.has(normalizeAttendanceStatus(att.status))) {
        summary.totalIzin++;
      }
    });

    const leaveConfigs = await prisma.leaveConfig.findMany({
      where: { ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: {
        submissionTypes: {
          select: { id: true, name: true },
        },
      },
    });

    const yearStart = new Date(recapYear, 0, 1);
    const yearEnd = new Date(recapYear, 11, 31, 23, 59, 59, 999);

    const yearSubmissions = await prisma.submission.findMany({
      where: {
        userId: id,
        status: "APPROVED",
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      include: { submissionType: true },
    });

    const submissionsHistory = await prisma.submission.findMany({
      where: {
        userId: id,
        startDate: isRange ? { lte: endDate } : { gte: yearStart, lte: yearEnd },
        ...(isRange ? { endDate: { gte: startDate } } : {}),
      },
      include: { submissionType: true },
      orderBy: { createdAt: "desc" },
    });

    const quotaYearStart = new Date(Date.UTC(recapYear, 0, 1));
    const quotaYearEnd = new Date(Date.UTC(recapYear, 11, 31));
    const countLeaveDays = await createLeaveDayCounter(prisma, id, {
      startDate: new Date(Math.min(quotaYearStart.getTime(), ...submissionsHistory.map((s) => s.startDate.getTime()))),
      endDate: new Date(Math.max(quotaYearEnd.getTime(), ...submissionsHistory.map((s) => s.endDate.getTime()))),
    });
    const countQuotaYearDays = (s: { startDate: Date; endDate: Date }) =>
      countLeaveDays({
        startDate: new Date(Math.max(s.startDate.getTime(), quotaYearStart.getTime())),
        endDate: new Date(Math.min(s.endDate.getTime(), quotaYearEnd.getTime())),
      });

    const leaveQuotas = leaveConfigs.map((config) => {
      const typeIds = config.submissionTypes.map((t) => t.id);
      const usedDays = yearSubmissions
        .filter((s) => typeIds.includes(s.submissionTypeId))
        .reduce((total, s) => total + countQuotaYearDays(s), 0);

      return {
        configName: config.name,
        maxDays: config.maxDays,
        usedDays,
        remainingDays: Math.max(0, config.maxDays - usedDays),
      };
    });

    const history = submissionsHistory.map((s) => ({
      id: s.id,
      type: s.submissionType.name,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate.toISOString(),
      workDays: countLeaveDays(s),
      calendarDays: Math.round((s.endDate.getTime() - s.startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
      reason: s.reason,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    }));

    return NextResponse.json({
      data: {
        user,
        month,
        year: recapYear,
        ...(isRange ? { startDate: requestedStart, endDate: requestedEnd } : {}),
        attendance: {
          summary,
          details: attendances.map((a) => ({
            id: a.id,
            date: a.date.toISOString(),
            checkIn: a.checkIn?.toISOString() || null,
            checkOut: a.checkOut?.toISOString() || null,
            status: a.status,
            notes: a.notes,
            workHours: a.workHours,
          })),
        },
        submissions: {
          leaveQuotas,
          history,
        },
      },
    });
  } catch (error) {
    console.error("RECAP API ERROR:", error);
    return NextResponse.json(
      { message: "Failed to retrieve recap data" },
      { status: 500 },
    );
  }
}
