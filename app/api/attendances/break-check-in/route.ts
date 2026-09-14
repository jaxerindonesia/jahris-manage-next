export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { BUCKET_AVATARS, uploadBase64ToMinio } from "@/lib/minio";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission } from "@/lib/auth/permission";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { validateBase64Image } from "@/lib/security/file-validation";
import { getBranchDistanceMeters } from "@/lib/helper/attendance";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function hasOpenBreak(breakSessions: unknown) {
  if (!Array.isArray(breakSessions)) return false;
  return breakSessions.some((session) => {
    if (!session || typeof session !== "object") return false;
    return !(session as { breakOut?: string | null }).breakOut;
  });
}

function hasAnyBreakSession(breakSessions: unknown) {
  return Array.isArray(breakSessions) && breakSessions.length > 0;
}

export async function POST(req: NextRequest) {
  let uploadedFaceImage: string | null = null;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;

    const body = await req.json();
    const { userId, breakInLocation, faceCaptureBase64 } = body;
    if (!userId) return jsonError("UserId is required", 400);

    const canManageAttendances = hasPermission(auth.user, "attendances", "update");
    const targetUserId = canManageAttendances ? userId : auth.user.id;

    const scopedTenantId = ensureTenantScope(auth.user);
    const finalTenantId = scopedTenantId ?? body.tenantId ?? null;
    const cfg =
      (await prisma.attendanceConfig.findFirst({
        where: finalTenantId ? { tenantId: finalTenantId } : {},
        orderBy: { updatedAt: "desc" },
      })) ?? null;
    if (!cfg?.breakEnabled) {
      return jsonError("Fitur absensi istirahat belum diaktifkan", 400);
    }

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
    if (!attendance?.checkIn) return jsonError("Silakan check in terlebih dahulu", 404);
    if (attendance.checkOut) return jsonError("Tidak bisa break setelah check out", 409);
    if (hasAnyBreakSession(attendance.breakSessions)) {
      return jsonError("Break hanya bisa dilakukan satu kali per hari", 409);
    }
    if (hasOpenBreak(attendance.breakSessions)) {
      return jsonError("Masih ada sesi break yang sedang berjalan", 409);
    }

    if (attendance.branch && !attendance.branch.isActive) {
      return jsonError("Cabang karyawan sedang nonaktif", 400);
    }
    const breakInDistanceMeters = attendance.branch
      ? getBranchDistanceMeters(attendance.branch, breakInLocation)
      : null;
    if (attendance.branch?.locationLockEnabled) {
      if (breakInDistanceMeters === null) {
        return jsonError("Lokasi wajib diaktifkan untuk break check in di cabang ini", 400);
      }
      if (breakInDistanceMeters > attendance.branch.attendanceRadiusMeters) {
        return jsonError(`Anda berada di luar radius cabang (${Math.round(breakInDistanceMeters)} m, maksimal ${attendance.branch.attendanceRadiusMeters} m)`, 400);
      }
    }

    if (cfg.breakFaceCaptureEnabled && !faceCaptureBase64) {
      return jsonError("Foto break wajib diambil saat config aktif", 400);
    }

    if (faceCaptureBase64) {
      const imageValidation = validateBase64Image(faceCaptureBase64, {
        maxBytes: 3 * 1024 * 1024,
      });
      if (!imageValidation.ok) {
        return jsonError(imageValidation.message, 415);
      }
      const breakInObjectName = await buildTenantStorageObjectName(
        finalTenantId,
        "attendance-face",
        `break-in-${randomUUID()}.${imageValidation.extension}`,
      );

      uploadedFaceImage = await uploadBase64ToMinio(
        faceCaptureBase64,
        breakInObjectName,
        BUCKET_AVATARS,
        imageValidation.contentType,
      );
    }

    const now = new Date().toISOString();
    const breakSessions = Array.isArray(attendance.breakSessions)
      ? [
          ...attendance.breakSessions,
          {
            breakIn: now,
            breakOut: null,
            duration: null,
            breakInLocation,
            breakInDistanceMeters,
            breakInFaceImage: uploadedFaceImage,
          },
        ]
      : [{
          breakIn: now,
          breakOut: null,
          duration: null,
          breakInLocation,
          breakInDistanceMeters,
          breakInFaceImage: uploadedFaceImage,
        }];

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { breakSessions },
    });

    return NextResponse.json({ message: "Break Check In successful", data: updated });
  } catch (error) {
    if (uploadedFaceImage) {
      // best-effort cleanup if persistence failed
    }
    const message = error instanceof Error ? error.message : "Failed to break check in";
    return NextResponse.json({ message }, { status: 500 });
  }
}
