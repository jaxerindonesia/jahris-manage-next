export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getJakartaDayKey } from "@/lib/helper/date";
import {
  AUTO_ABSENT_NOTE,
  AUTO_SUBMISSION_ATTENDANCE_NOTE,
} from "@/lib/helper/submission-attendance";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const tenantId = body?.tenantId;
    if (typeof tenantId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return NextResponse.json({ message: "tenantId wajib berupa UUID yang valid" }, { status: 400 });
    }

    const today = getJakartaDayKey(new Date());
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const attendances = await prisma.attendance.findMany({
      where: {
        tenantId,
        attendanceDay: { lte: yesterday },
        status: "Absent",
        notes: AUTO_ABSENT_NOTE,
        checkIn: null,
        checkOut: null,
      },
      select: { id: true, userId: true, attendanceDay: true },
    });

    if (attendances.length === 0) {
      return NextResponse.json({ message: "Attendance reconciliation completed", tenantId, checked: 0, updated: 0 });
    }

    const firstDay = attendances.reduce(
      (earliest, attendance) => attendance.attendanceDay < earliest ? attendance.attendanceDay : earliest,
      yesterday,
    );
    const submissions = await prisma.submission.findMany({
      where: {
        tenantId,
        status: "APPROVED",
        userId: { in: [...new Set(attendances.map((attendance) => attendance.userId))] },
        startDate: { lt: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 7 * 60 * 60 * 1000) },
        endDate: { gte: new Date(firstDay.getTime() - 7 * 60 * 60 * 1000) },
      },
      select: {
        userId: true,
        startDate: true,
        endDate: true,
        submissionType: { select: { name: true } },
      },
      orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
    });

    const submissionsByUser = new Map<string, typeof submissions>();
    for (const submission of submissions) {
      const userSubmissions = submissionsByUser.get(submission.userId) ?? [];
      userSubmissions.push(submission);
      submissionsByUser.set(submission.userId, userSubmissions);
    }

    let updated = 0;
    for (const attendance of attendances) {
      const matching = submissionsByUser.get(attendance.userId)?.find((submission) =>
        getJakartaDayKey(submission.startDate) <= attendance.attendanceDay &&
        getJakartaDayKey(submission.endDate) >= attendance.attendanceDay,
      );
      if (!matching) continue;

      const result = await prisma.attendance.updateMany({
        where: {
          id: attendance.id,
          tenantId,
          status: "Absent",
          notes: AUTO_ABSENT_NOTE,
          checkIn: null,
          checkOut: null,
        },
        data: {
          status: matching.submissionType.name,
          notes: AUTO_SUBMISSION_ATTENDANCE_NOTE,
          workHours: "00:00",
        },
      });
      updated += result.count;
    }

    return NextResponse.json({
      message: "Attendance reconciliation completed",
      tenantId,
      checked: attendances.length,
      updated,
    });
  } catch (error) {
    console.error("CRON ATTENDANCE APPROVED SUBMISSIONS ERROR:", error);
    return NextResponse.json({ message: "Failed to reconcile attendance" }, { status: 500 });
  }
}
