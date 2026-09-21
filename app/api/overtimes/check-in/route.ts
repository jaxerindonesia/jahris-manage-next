export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission } from "@/lib/auth/permission";
import { BUCKET_AVATARS, deleteFromMinio, uploadBase64ToMinio } from "@/lib/minio";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { validateBase64Image } from "@/lib/security/file-validation";

function formatJakartaDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export async function POST(req: Request) {
  let uploadedFaceImage: string | null = null;

  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;

    const body = await req.json();
    const overtimeId = String(body.overtimeId || "").trim();
    const userId = String(body.userId || "").trim();
    const faceCaptureBase64 = String(body.faceCaptureBase64 || "");
    const checkInLocation = body.checkInLocation ?? null;
    const canManageOvertimes = hasPermission(auth.user, "overtimes", "update");
    const scopedTenantId = ensureTenantScope(auth.user);

    if (!overtimeId || !userId) {
      return NextResponse.json(
        { message: "overtimeId dan userId wajib diisi" },
        { status: 400 },
      );
    }
    if (!faceCaptureBase64) {
      return NextResponse.json(
        { message: "Bukti foto wajah wajib diisi" },
        { status: 400 },
      );
    }

    const imageValidation = validateBase64Image(faceCaptureBase64, {
      maxBytes: 3 * 1024 * 1024,
    });
    if (!imageValidation.ok) {
      return NextResponse.json({ message: imageValidation.message }, { status: 415 });
    }

    if (!canManageOvertimes && userId !== auth.user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const overtime = await prisma.overtime.findFirst({
      where: {
        id: overtimeId,
        userId: canManageOvertimes ? userId : auth.user.id,
        ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        overtimeDate: true,
        status: true,
        checkInFaceImage: true,
      },
    });
    if (!overtime) {
      return NextResponse.json({ message: "Pengajuan lembur tidak ditemukan" }, { status: 404 });
    }
    if (overtime.status !== "DRAFT") {
      return NextResponse.json(
        { message: "Check in hanya bisa dilakukan pada pengajuan lembur draft" },
        { status: 409 },
      );
    }

    const overtimeDateLabel = formatJakartaDate(overtime.overtimeDate);
    const todayLabel = formatJakartaDate(new Date());

    if (todayLabel < overtimeDateLabel) {
      return NextResponse.json(
        { message: "Check in lembur belum bisa dilakukan sebelum tanggal pengajuan" },
        { status: 409 },
      );
    }

    if (todayLabel > overtimeDateLabel) {
      return NextResponse.json(
        { message: "Check in lembur hanya bisa dilakukan pada tanggal pengajuan yang sama" },
        { status: 409 },
      );
    }

    const existingCheckedIn = await prisma.overtime.findFirst({
      where: {
        userId: overtime.userId,
        ...(overtime.tenantId ? { tenantId: overtime.tenantId } : { tenantId: null }),
        attendanceId: null,
        status: "CHECKED_IN",
        startTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        NOT: { id: overtime.id },
      },
      select: { id: true },
    });
    if (existingCheckedIn) {
      return NextResponse.json(
        { message: "Masih ada lembur lain yang belum checkout" },
        { status: 409 },
      );
    }

    const checkInObjectName = await buildTenantStorageObjectName(
      overtime.tenantId,
      "overtime-face",
      `check-in-${randomUUID()}.${imageValidation.extension}`,
    );
    uploadedFaceImage = await uploadBase64ToMinio(
      faceCaptureBase64,
      checkInObjectName,
      BUCKET_AVATARS,
      imageValidation.contentType,
    );

    const now = new Date();
    const updated = await prisma.overtime.update({
      where: { id: overtime.id },
      data: {
        startTime: now,
        status: "CHECKED_IN",
        checkInLocation,
        checkInFaceImage: uploadedFaceImage,
      },
    });

    return NextResponse.json({
      message: "Check in lembur berhasil",
      data: updated,
    });
  } catch (error) {
    if (uploadedFaceImage) {
      await deleteFromMinio(uploadedFaceImage);
    }
    console.error("OVERTIME CHECK IN ERROR:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Gagal check in lembur" },
      { status: 500 },
    );
  }
}
