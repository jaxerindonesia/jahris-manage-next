export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { BUCKET_AVATARS, deleteFromMinio } from "@/lib/minio";
import { getJakartaDayKey } from "@/lib/helper/date";
import { requirePermission } from "@/lib/auth/permission";
import { backupAttendance, AttendanceBackupError } from "@/lib/helper/attendance-backup";
import { writeAuditLog } from "@/lib/security/audit-log";
import { getRequestIp } from "@/lib/security/request";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "attendances", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const attendance = await prisma.attendance.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });

    if (!attendance) {
      return NextResponse.json(
        { message: "Attendance not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "Attendance retrieved successfully",
      data: attendance,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve attendance" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "attendances", "update");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.attendance.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });
    if (!existing) return NextResponse.json({ message: "Attendance not found" }, { status: 404 });

    const body = await req.json();

    const updateData: Prisma.AttendanceUncheckedUpdateInput = {};

    if (body.userId) {
      const user = await prisma.user.findFirst({
        where: { id: body.userId, tenantId: existing.tenantId, deletedAt: null }, select: { id: true },
      });
      if (!user) return NextResponse.json({ message: "Karyawan tidak ditemukan dalam perusahaan ini" }, { status: 400 });
      updateData.userId = body.userId;
    }
    if (body.date) {
      const date = new Date(body.date);
      if (Number.isNaN(date.getTime())) return NextResponse.json({ message: "Tanggal absensi tidak valid" }, { status: 400 });
      updateData.date = date;
      const attendanceDay = getJakartaDayKey(date);
      updateData.attendanceDay = attendanceDay;
    }
    if (body.checkIn) updateData.checkIn = body.checkIn;
    if (body.checkOut) updateData.checkOut = body.checkOut;
    if (body.status) updateData.status = body.status;
    if (body.notes) updateData.notes = body.notes;

    const backup = await backupAttendance(existing, {
      action: "before-update", actorUserId: auth.user.id, actorRole: auth.user.roleName,
      ipAddress: getRequestIp(req), changes: updateData,
    });
    const result = await prisma.attendance.updateMany({
      where: { id: p.id, updatedAt: existing.updatedAt },
      data: updateData,
    });
    if (!result.count) return NextResponse.json({ message: "Absensi telah berubah. Muat ulang sebelum mengedit." }, { status: 409 });
    const attendance = await prisma.attendance.findUnique({ where: { id: p.id } });
    writeAuditLog({
      action: "attendances.update", status: "success", request: req,
      actorUserId: auth.user.id, actorRole: auth.user.roleName, tenantId: existing.tenantId,
      targetType: "attendance", targetId: p.id, metadata: { backup },
    });

    return NextResponse.json({
      message: "Attendance successfully updated",
      data: attendance,
    });
  } catch (error) {
    if (error instanceof AttendanceBackupError) return NextResponse.json({ message: error.message }, { status: 503 });
    const message = error instanceof Error ? error.message : "";
    if (message.includes("P2002") || message.includes("Unique constraint")) {
      return NextResponse.json(
        { message: "Attendance already exists for this user on that day" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "Failed to update attendance" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "attendances", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.attendance.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });
    if (!existing) return NextResponse.json({ message: "Attendance not found" }, { status: 404 });

    const evidenceUrls = [existing.checkInFaceImage, existing.checkOutFaceImage].filter(
      (url): url is string => typeof url === "string" && url.includes(BUCKET_AVATARS),
    );

    const backup = await backupAttendance(existing, {
      action: "before-delete", actorUserId: auth.user.id, actorRole: auth.user.roleName,
      ipAddress: getRequestIp(req),
    });
    const result = await prisma.attendance.deleteMany({ where: { id: p.id, updatedAt: existing.updatedAt } });
    if (!result.count) return NextResponse.json({ message: "Absensi telah berubah. Muat ulang sebelum menghapus." }, { status: 409 });
    writeAuditLog({
      action: "attendances.delete", status: "success", request: req,
      actorUserId: auth.user.id, actorRole: auth.user.roleName, tenantId: existing.tenantId,
      targetType: "attendance", targetId: p.id, metadata: { backup },
    });

    await Promise.all(evidenceUrls.map(async (url) => {
      const linked = await prisma.overtime.findFirst({
        where: { OR: [{ checkInFaceImage: url }, { checkOutFaceImage: url }, { proofUrl: url }] },
        select: { id: true },
      });
      if (!linked) await deleteFromMinio(url);
    }));

    return NextResponse.json({
      message: "Attendance successfully deleted",
    });
  } catch (error) {
    if (error instanceof AttendanceBackupError) return NextResponse.json({ message: error.message }, { status: 503 });
    return NextResponse.json(
      { message: "Failed to delete attendance" },
      { status: 500 },
    );
  }
}
