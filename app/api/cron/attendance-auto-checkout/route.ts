export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getJakartaDayRange } from "@/lib/helper/date";

function isAuthorizedCron(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { startUtc, endUtc } = getJakartaDayRange();
    const jobRunTime = new Date();
    const staleCheckInBefore = new Date(jobRunTime.getTime() - 24 * 60 * 60 * 1000);

    const openAttendances = await prisma.attendance.findMany({
      where: {
        checkOut: null,
        scheduledEndAt: { lte: jobRunTime },
        OR: [{ checkIn: null }, { checkIn: { lte: staleCheckInBefore } }],
      },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        status: true,
        checkIn: true,
        scheduledEndAt: true,
      },
    });

    if (openAttendances.length === 0) {
      return NextResponse.json({
        message: "Attendance auto checkout job completed",
        updated: 0,
        targetDateStart: startUtc.toISOString(),
        targetDateEnd: endUtc.toISOString(),
      });
    }

    const results = await prisma.$transaction(
      openAttendances.map((attendance) =>
        {
          const officeEnd = attendance.scheduledEndAt ?? jobRunTime;
          const effectiveCheckoutTime = attendance.checkIn
            ? new Date(Math.max(new Date(attendance.checkIn).getTime(), officeEnd.getTime()))
            : officeEnd;
          const wasLate = attendance.status === "Late";

          const status = !attendance.checkIn
            ? "Absent"
            : wasLate
              ? "Late - Present"
              : "Present";

          return prisma.attendance.updateMany({
            where: { id: attendance.id, checkOut: null },
            data: {
              checkOut: effectiveCheckoutTime,
              autoCheckout: true,
              checkOutLocation: Prisma.JsonNull,
              checkOutFaceImage: null,
              workHours: attendance.checkIn
                ? (() => {
                    const diffMs =
                      effectiveCheckoutTime.getTime() - new Date(attendance.checkIn).getTime();
                    const totalMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
                  })()
                : "00:00",
              notes: "Auto checkout at scheduled shift end",
              status,
            },
          });
        },
      ),
    );

    return NextResponse.json({
      message: "Attendance auto checkout job completed",
      updated: results.reduce((total, result) => total + result.count, 0),
      targetDateStart: startUtc.toISOString(),
      targetDateEnd: endUtc.toISOString(),
    });
  } catch (error) {
    console.error("CRON ATTENDANCE AUTO CHECKOUT ERROR:", error);
    return NextResponse.json(
      { message: "Failed to run attendance auto checkout job" },
      { status: 500 },
    );
  }
}
