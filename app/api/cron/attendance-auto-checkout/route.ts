export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getJakartaDayRange } from "@/lib/helper/date";
import { getLegacyCheckoutEnd } from "@/lib/helper/attendance-auto-checkout";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const jobRunTime = new Date();
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
    const { startUtc, endUtc } = getJakartaDayRange(jobRunTime);
    const openAttendances = await prisma.attendance.findMany({
      where: {
        checkIn: { not: null, lte: jobRunTime },
        checkOut: null,
        OR: [{ scheduledEndAt: { lte: jobRunTime } }, { scheduledEndAt: null }],
      },
      select: {
        id: true, tenantId: true, status: true, notes: true, checkIn: true,
        scheduledEndAt: true, scheduleSource: true, workShiftId: true,
      },
    });

    const legacyConfigs = new Map<string | null, { officeStartTime: string; officeEndTime: string } | null>();
    let eligible = 0;
    let updated = 0;
    let legacyEligible = 0;
    let skippedMissingSchedule = 0;
    let skippedNotDue = 0;

    for (const attendance of openAttendances) {
      if (!attendance.checkIn) continue;
      let officeEnd = attendance.scheduledEndAt;
      if (!officeEnd) {
        // Never substitute regular office hours for a new shift with a missing snapshot.
        if (attendance.scheduleSource || attendance.workShiftId) {
          skippedMissingSchedule++;
          continue;
        }
        if (!legacyConfigs.has(attendance.tenantId)) {
          legacyConfigs.set(attendance.tenantId, await prisma.attendanceConfig.findFirst({
            where: { tenantId: attendance.tenantId },
            orderBy: { updatedAt: "desc" },
            select: { officeStartTime: true, officeEndTime: true },
          }));
        }
        officeEnd = getLegacyCheckoutEnd(attendance.checkIn, legacyConfigs.get(attendance.tenantId) ?? null);
        if (!officeEnd) {
          skippedMissingSchedule++;
          continue;
        }
      }
      if (officeEnd > jobRunTime) {
        skippedNotDue++;
        continue;
      }
      eligible++;
      if (!attendance.scheduledEndAt) legacyEligible++;
      if (dryRun) continue;

      const checkOut = new Date(Math.max(attendance.checkIn.getTime(), officeEnd.getTime()));
      const minutes = Math.max(0, Math.floor((checkOut.getTime() - attendance.checkIn.getTime()) / 60000));
      const note = attendance.scheduledEndAt
        ? "Auto checkout at scheduled shift end"
        : "Auto checkout using legacy tenant schedule";
      const result = await prisma.attendance.updateMany({
        // Preserve concurrent manual checkout and schedule/status edits.
        where: {
          id: attendance.id, checkOut: null, checkIn: attendance.checkIn,
          scheduledEndAt: attendance.scheduledEndAt, status: attendance.status, notes: attendance.notes,
          scheduleSource: attendance.scheduleSource, workShiftId: attendance.workShiftId,
        },
        data: {
          checkOut, autoCheckout: true,
          checkOutLocation: Prisma.JsonNull, checkOutFaceImage: null,
          workHours: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
          notes: attendance.notes ? `${attendance.notes}\n${note}` : note,
          status: attendance.status === "Late" ? "Late - Present" : "Present",
        },
      });
      updated += result.count;
    }

    const result = {
      message: "Attendance auto checkout job completed", dryRun,
      checked: openAttendances.length, eligible, updated, legacyEligible,
      skippedMissingSchedule, skippedNotDue,
      targetDateStart: startUtc.toISOString(), targetDateEnd: endUtc.toISOString(),
    };
    console.info("CRON ATTENDANCE AUTO CHECKOUT", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("CRON ATTENDANCE AUTO CHECKOUT ERROR:", error);
    return NextResponse.json({ message: "Failed to run attendance auto checkout job" }, { status: 500 });
  }
}
