export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import {
  BUCKET_AVATARS,
  deleteFromMinio,
  uploadBase64ToMinio,
} from "@/lib/minio";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission } from "@/lib/auth/permission";
import { resolveActiveWorkSchedule } from "@/lib/helper/work-schedule";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { validateBase64Image } from "@/lib/security/file-validation";
import { haversineKm } from "@/lib/helper/attendance";

function jsonError(message: string, status: number, detail?: string) {
  return NextResponse.json(
    {
      message,
      ...(detail ? { detail } : {}),
    },
    { status },
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export async function POST(req: Request) {
  let uploadedFaceImage: string | null = null;

  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;

    const body = await req.json();
    const { userId, checkInLocation, faceCaptureBase64 } = body;
    const canManageAttendances = hasPermission(auth.user, "attendances", "create");

    if (!userId) {
      return jsonError("UserId is required", 400);
    }
    if (!faceCaptureBase64) {
      return jsonError("Face capture evidence is required", 400);
    }
    const imageValidation = validateBase64Image(faceCaptureBase64, {
      maxBytes: 3 * 1024 * 1024,
    });
    if (!imageValidation.ok) {
      return jsonError(imageValidation.message, 415);
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    const finalTenantId = scopedTenantId ?? body.tenantId ?? null;
    const targetUserId = canManageAttendances ? userId : auth.user.id;

    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, ...(finalTenantId ? { tenantId: finalTenantId } : {}) },
      include: { branch: true },
    });
    if (!targetUser) return jsonError("User not found", 404);
    const branch = targetUser.branch;
    if (branch && !branch.isActive) return jsonError("Cabang karyawan sedang nonaktif", 400);
    const latitude = Number(checkInLocation?.latitude);
    const longitude = Number(checkInLocation?.longitude);
    const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
    let checkInDistanceMeters: number | null = null;
    if (branch && hasLocation) {
      checkInDistanceMeters = haversineKm(branch.latitude, branch.longitude, latitude, longitude) * 1000;
    }
    if (branch?.locationLockEnabled) {
      if (!hasLocation) return jsonError("Lokasi wajib diaktifkan untuk absensi di cabang ini", 400);
      if ((checkInDistanceMeters ?? Infinity) > branch.attendanceRadiusMeters) {
        return jsonError(`Anda berada di luar radius cabang (${Math.round(checkInDistanceMeters ?? 0)} m, maksimal ${branch.attendanceRadiusMeters} m)`, 400);
      }
    }

    // If not admin, force targetUserId to be the logged-in user (prevents 403 if localStorage is out of sync)
    // We already set `targetUserId` above safely.

    const now = new Date();
    const schedule = await resolveActiveWorkSchedule(prisma, targetUserId, now);
    if (!schedule) return jsonError("Tidak ada jadwal kerja untuk hari ini", 400);
    const officeStart = schedule.startAt;
    const lateLimit = new Date(
      officeStart.getTime() + schedule.lateToleranceMinutes * 60 * 1000,
    );
    const checkInStatus = now <= lateLimit ? "On Time" : "Late";
    const attendanceDay = schedule.workDate;

    const checkInObjectName = await buildTenantStorageObjectName(
      finalTenantId,
      "attendance-face",
      `check-in-${randomUUID()}.${imageValidation.extension}`,
    );

    uploadedFaceImage = await uploadBase64ToMinio(
      faceCaptureBase64,
      checkInObjectName,
      BUCKET_AVATARS,
      imageValidation.contentType,
    );

    const attendance = await prisma.$transaction(async (tx) => {
      const existingToday = await tx.attendance.findFirst({
        where: {
          ...(finalTenantId ? { tenantId: finalTenantId } : {}),
          userId: targetUserId,
          attendanceDay,
        },
        select: {
          id: true,
          checkIn: true,
          checkOut: true,
        },
      });

      if (existingToday?.checkIn) {
        const error = new Error("You have already checked in today") as Error & {
          status?: number;
        };
        error.status = 409;
        throw error;
      }

      const attendanceData = {
        tenantId: finalTenantId,
        branchId: branch?.id || null,
        workShiftId: schedule.shiftId || null,
        scheduledStartAt: schedule.startAt,
        scheduledEndAt: schedule.endAt,
        scheduleSource: schedule.source,
        date: now,
        attendanceDay,
        checkIn: now,
        status: checkInStatus,
        notes: null,
        workHours: "0",
        checkInLocation,
        checkInDistanceMeters,
        checkInFaceImage: uploadedFaceImage,
      };

      if (existingToday) {
        return tx.attendance.update({
          where: { id: existingToday.id },
          data: attendanceData,
        });
      }

      return tx.attendance.create({
        data: {
          ...attendanceData,
          userId: targetUserId,
        },
      });
    });

    return NextResponse.json(
      {
        message: "Check In successful",
        data: attendance,
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedFaceImage) {
      await deleteFromMinio(uploadedFaceImage);
    }

    const typedError = error as Error & { status?: number };
    const message = getErrorMessage(error);
    if (typedError.status === 409) {
      return jsonError(message, 409);
    }
    if (message === "You have already checked in today") {
      return jsonError(message, 409);
    }

    if (message.includes("Unique constraint") || message.includes("P2002")) {
      return jsonError("Attendance already exists for this user", 409, message);
    }

    if (message.includes("Unauthorized")) {
      return jsonError("Unauthorized", 401, message);
    }

    return jsonError("Failed to create attendance", 500, message);
  }
}
