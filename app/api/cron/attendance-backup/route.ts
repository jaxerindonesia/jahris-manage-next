export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { getAttendanceCronDay } from "@/lib/helper/attendance-cron";
import { backupAttendance, requireAttendanceBackupBucket } from "@/lib/helper/attendance-backup";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  let day: Date;
  try { day = getAttendanceCronDay(request.nextUrl.searchParams.get("date")); }
  catch { return NextResponse.json({ message: "Tanggal cron tidak valid atau belum lewat" }, { status: 400 }); }
  try {
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
    const bucket = await requireAttendanceBackupBucket();
    let cursor: string | undefined;
    let checked = 0;
    let backedUp = 0;
    let failed = 0;
    do {
      const rows = await prisma.attendance.findMany({
        where: { attendanceDay: day }, orderBy: { id: "asc" }, take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const row of rows) {
        checked++;
        if (dryRun) continue;
        try { await backupAttendance(row, { action: "scheduled" }, bucket); backedUp++; }
        catch { failed++; console.error("ATTENDANCE SCHEDULED BACKUP FAILED", { attendanceId: row.id }); }
      }
      cursor = rows.at(-1)!.id;
    } while (cursor);
    const result = { message: "Attendance backup completed", date: day.toISOString().slice(0, 10), dryRun, checked, backedUp, failed };
    console.info("CRON ATTENDANCE BACKUP", result);
    return NextResponse.json(result, { status: failed ? 500 : 200 });
  } catch (error) {
    console.error("CRON ATTENDANCE BACKUP ERROR", error);
    return NextResponse.json({ message: "Backup absensi gagal. Periksa konfigurasi bucket dan log server." }, { status: 503 });
  }
}
