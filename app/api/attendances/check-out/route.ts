export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { BUCKET_AVATARS, uploadBase64ToMinio } from "@/lib/minio";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission } from "@/lib/auth/permission";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { validateBase64Image } from "@/lib/security/file-validation";
import { haversineKm } from "@/lib/helper/attendance";
import { getAttendanceOvertime } from "@/lib/helper/attendance-overtime";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;

    const body = await req.json();
    const scopedTenantId = ensureTenantScope(auth.user);
    const finalTenantId = scopedTenantId ?? body.tenantId ?? null;
    const { userId, checkOutLocation, faceCaptureBase64 } = body;
    const canManageAttendances = hasPermission(auth.user, "attendances", "update");

    if (!userId) {
      return NextResponse.json(
        { message: "UserId is required" },
        { status: 400 },
      );
    }
    if (!faceCaptureBase64) {
      return NextResponse.json(
        { message: "Face capture evidence is required" },
        { status: 400 },
      );
    }
    const imageValidation = validateBase64Image(faceCaptureBase64, {
      maxBytes: 3 * 1024 * 1024,
    });
    if (!imageValidation.ok) {
      return NextResponse.json({ message: imageValidation.message }, { status: 415 });
    }

    if (!canManageAttendances && userId !== auth.user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const targetUserId = canManageAttendances ? userId : auth.user.id;

    const attendance = await prisma.attendance.findFirst({
      where: {
        ...(finalTenantId ? { tenantId: finalTenantId } : {}),
        userId: targetUserId,
        checkIn: { not: null },
        checkOut: null,
      },
      include: { branch: true },
      orderBy: { checkIn: "desc" },
    });

    if (!attendance) {
      return NextResponse.json(
        { message: "You have not checked in today" },
        { status: 404 },
      );
    }

    if (!attendance.checkIn) {
      return NextResponse.json(
        { message: "Attendance record is incomplete: check-in is missing" },
        { status: 409 },
      );
    }

    if (attendance.checkOut) {
      return NextResponse.json(
        { message: "Already checked out today" },
        { status: 409 },
      );
    }

    const latitude = Number(checkOutLocation?.latitude);
    const longitude = Number(checkOutLocation?.longitude);
    const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
    let checkOutDistanceMeters: number | null = null;
    if (attendance.branch && hasLocation) {
      checkOutDistanceMeters = haversineKm(attendance.branch.latitude, attendance.branch.longitude, latitude, longitude) * 1000;
    }
    if (attendance.branch?.locationLockEnabled) {
      if (!hasLocation) return NextResponse.json({ message: "Lokasi wajib diaktifkan untuk absensi di cabang ini" }, { status: 400 });
      if ((checkOutDistanceMeters ?? Infinity) > attendance.branch.attendanceRadiusMeters) {
        return NextResponse.json({ message: `Anda berada di luar radius cabang (${Math.round(checkOutDistanceMeters ?? 0)} m, maksimal ${attendance.branch.attendanceRadiusMeters} m)` }, { status: 400 });
      }
    }

    const now = new Date();
    const checkOutObjectName = await buildTenantStorageObjectName(
      finalTenantId,
      "attendance-face",
      `check-out-${randomUUID()}.${imageValidation.extension}`,
    );

    const checkOutFaceImage = await uploadBase64ToMinio(
      faceCaptureBase64,
      checkOutObjectName,
      BUCKET_AVATARS,
      imageValidation.contentType,
    );

    // hitung jam kerja
    const checkInTime = new Date(attendance.checkIn!);
    const diffMs = now.getTime() - checkInTime.getTime();
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const formattedWorkHours = `${String(hours).padStart(2, "0")}:${String(
      minutes,
    ).padStart(2, "0")}`;

    const officeEnd = attendance.scheduledEndAt ?? now;
    const isHalfDay = now < officeEnd;
    const wasLate = attendance.status === "Late";
    let status: string;
    if (wasLate && isHalfDay) {
      status = "Late - Half Day";
    } else if (wasLate && !isHalfDay) {
      status = "Late - Present";
    } else if (!wasLate && isHalfDay) {
      status = "Half Day";
    } else {
      status = "Present";
    }

    const updated = await prisma.$transaction(async (tx) => {
      return tx.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOut: now.toISOString(),
          autoCheckout: false,
          status,
          workHours: formattedWorkHours,
          checkOutLocation,
          checkOutDistanceMeters,
          checkOutFaceImage,
        },
      });
    });

    let overtimeSuggestion = null;
    if (targetUserId === auth.user.id && hasPermission(auth.user, "overtimes", "create")) {
      const config = await prisma.attendanceConfig.findFirst({ where: { tenantId: updated.tenantId }, orderBy: { updatedAt: "desc" } });
      const linked = await prisma.overtime.findUnique({ where: { attendanceId: updated.id }, select: { id: true } });
      if (!linked) overtimeSuggestion = getAttendanceOvertime(updated, config?.overtimeThresholdHours ?? 2);
    }

    return NextResponse.json({
      message: "Check Out successful",
      data: updated,
      overtimeSuggestion,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check out";
    return NextResponse.json(
      { message },
      { status: 500 },
    );
  }
}
