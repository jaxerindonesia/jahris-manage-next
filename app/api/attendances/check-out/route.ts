export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import {
  BUCKET_AVATARS,
  deleteFromMinio,
  uploadBufferToMinio,
} from "@/lib/minio";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission } from "@/lib/auth/permission";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { validateBase64Image } from "@/lib/security/file-validation";
import { haversineKm } from "@/lib/helper/attendance";
import { getAttendanceOvertime } from "@/lib/helper/attendance-overtime";
import { verifyFaceVerificationToken } from "@/lib/server/face-verification-token";
import {
  CHECK_OUT_MINIMUM_WAIT_MINUTES,
  CHECK_OUT_MINIMUM_WAIT_MS,
} from "@/lib/attendance/constants";

export async function POST(req: NextRequest) {
  const startedAt = performance.now();
  let uploadedFaceImage: string | null = null;
  let attendancePersisted = false;

  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;

    const body = await req.json();
    const scopedTenantId = ensureTenantScope(auth.user);
    const finalTenantId = scopedTenantId ?? body.tenantId ?? null;
    const { userId, checkOutLocation, faceCaptureBase64, faceVerificationToken } = body;
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

    const targetUserId = canManageAttendances ? userId : auth.user.id;
    if (!verifyFaceVerificationToken(faceVerificationToken, targetUserId, "check-out")) {
      return NextResponse.json(
        { message: "Verifikasi wajah tidak valid atau sudah kedaluwarsa" },
        { status: 401 },
      );
    }

    const objectFilename = `check-out-${randomUUID()}.${imageValidation.extension}`;
    // Attendance lookup and tenant storage naming are independent, so avoid
    // paying their database latency one after another.
    const [attendance, checkOutObjectName] = await Promise.all([
      prisma.attendance.findFirst({
        where: {
          ...(finalTenantId ? { tenantId: finalTenantId } : {}),
          userId: targetUserId,
          checkIn: { not: null },
          checkOut: null,
        },
        include: { branch: true },
        orderBy: { checkIn: "desc" },
      }),
      buildTenantStorageObjectName(
        finalTenantId,
        "attendance-face",
        objectFilename,
      ),
    ]);

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

    const checkInTimestamp = attendance.checkIn.getTime();
    const remainingWaitMs = CHECK_OUT_MINIMUM_WAIT_MS - (Date.now() - checkInTimestamp);
    if (remainingWaitMs > 0) {
      const remainingMinutes = Math.ceil(remainingWaitMs / (60 * 1000));
      return NextResponse.json(
        {
          message: `Check Out baru dapat dilakukan ${CHECK_OUT_MINIMUM_WAIT_MINUTES} menit setelah Check In. Tunggu sekitar ${remainingMinutes} menit lagi.`,
          remainingSeconds: Math.ceil(remainingWaitMs / 1000),
        },
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
    const uploadStartedAt = performance.now();
    uploadedFaceImage = await uploadBufferToMinio(
      imageValidation.buffer,
      checkOutObjectName,
      BUCKET_AVATARS,
      imageValidation.contentType,
    );
    const uploadMs = Math.round(performance.now() - uploadStartedAt);

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

    const databaseStartedAt = performance.now();
    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: now.toISOString(),
        autoCheckout: false,
        status,
        workHours: formattedWorkHours,
        checkOutLocation,
        checkOutDistanceMeters,
        checkOutFaceImage: uploadedFaceImage,
      },
    });
    attendancePersisted = true;

    let overtimeSuggestion = null;
    if (targetUserId === auth.user.id && hasPermission(auth.user, "overtimes", "create")) {
      try {
        const [config, linked] = await Promise.all([
          prisma.attendanceConfig.findFirst({ where: { tenantId: updated.tenantId }, orderBy: { updatedAt: "desc" } }),
          prisma.overtime.findFirst({ where: { attendanceId: updated.id }, select: { id: true } }),
        ]);
        if (!linked) overtimeSuggestion = getAttendanceOvertime(updated, config?.overtimeThresholdHours ?? 2);
      } catch (error) {
        console.warn("Unable to prepare overtime suggestion after check-out", {
          attendanceId: updated.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const databaseMs = Math.round(performance.now() - databaseStartedAt);
    console.info(JSON.stringify({
      timestamp: new Date().toISOString(),
      category: "attendance_check_out_performance",
      userId: targetUserId,
      tenantId: finalTenantId,
      uploadMs,
      databaseMs,
      totalMs: Math.round(performance.now() - startedAt),
    }));

    return NextResponse.json({
      message: "Check Out successful",
      data: updated,
      overtimeSuggestion,
    });
  } catch (error) {
    if (uploadedFaceImage && !attendancePersisted) {
      await deleteFromMinio(uploadedFaceImage);
    }
    const message = error instanceof Error ? error.message : "Failed to check out";
    return NextResponse.json(
      { message },
      { status: 500 },
    );
  }
}
