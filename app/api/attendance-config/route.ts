export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission, requirePermission } from "@/lib/auth/permission";
import { formatTimeInputValue } from "@/lib/helper/date";
import { resolveActiveWorkSchedule } from "@/lib/helper/work-schedule";

const DEFAULT_CONFIG = {
  officeStartTime: "09:00",
  officeEndTime: "17:00",
  lateToleranceMinutes: 15,
  lateDeductionAmount: 0,
  overtimeThresholdHours: 2,
  breakEnabled: false,
  breakFaceCaptureEnabled: false,
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
};

const VALID_WORKING_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
type WorkingDayCode = (typeof VALID_WORKING_DAYS)[number];

export async function GET() {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const canReadAttendanceConfig =
      hasPermission(auth.user, "attendances", "create") ||
      hasPermission(auth.user, "attendances", "update") ||
      hasPermission(auth.user, "attendances", "get-all") ||
      hasPermission(auth.user, "attendances", "get-by-id");

    if (!canReadAttendanceConfig) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const scopedTenantId = ensureTenantScope(auth.user);

    const cfg = await prisma.attendanceConfig.findFirst({
      where: { tenantId: scopedTenantId },
      orderBy: { updatedAt: "desc" },
    });
    const workSchedule = await resolveActiveWorkSchedule(
      prisma,
      auth.user.id,
      new Date(),
    );

    return NextResponse.json({
      message: "OK",
      data: cfg ?? DEFAULT_CONFIG,
      isDefault: !cfg,
      effectiveWorkSchedule: workSchedule
        ? {
            source: workSchedule.source,
            startTime: formatTimeInputValue(workSchedule.startAt),
            endTime: formatTimeInputValue(workSchedule.endAt),
            shiftName: workSchedule.shiftName ?? null,
          }
        : null,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to fetch attendance config" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "attendances", "set-config");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const body = await req.json();
    const officeStartTime = String(body.officeStartTime || "").trim();
    const officeEndTime = String(body.officeEndTime || "").trim();
    const lateToleranceMinutes = Number(body.lateToleranceMinutes);
    const lateDeductionAmount = Number(body.lateDeductionAmount);
    const overtimeThresholdHours = Number(body.overtimeThresholdHours ?? 2);
    if (!Number.isFinite(overtimeThresholdHours) || overtimeThresholdHours < 0 || overtimeThresholdHours > 24) {
      return NextResponse.json({ message: "Minimal lembur harus antara 0 dan 24 jam" }, { status: 400 });
    }
    const breakEnabled = Boolean(body.breakEnabled);
    const breakFaceCaptureEnabled = Boolean(body.breakFaceCaptureEnabled);
    const workingDaysInput: unknown[] = Array.isArray(body.workingDays)
      ? body.workingDays
      : [];
    const normalizedWorkingDays = workingDaysInput
      .map((d) => String(d || "").trim().toUpperCase())
      .filter((d): d is WorkingDayCode =>
        VALID_WORKING_DAYS.includes(d as WorkingDayCode),
      );
    const workingDays = [...new Set(normalizedWorkingDays)] as WorkingDayCode[];

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(officeStartTime) || !timeRegex.test(officeEndTime)) {
      return NextResponse.json(
        { message: "Format jam harus HH:mm" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(lateToleranceMinutes) || lateToleranceMinutes < 0) {
      return NextResponse.json(
        { message: "Toleransi keterlambatan harus angka >= 0" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(lateDeductionAmount) || lateDeductionAmount < 0) {
      return NextResponse.json(
        { message: "Potongan keterlambatan harus angka >= 0" },
        { status: 400 },
      );
    }
    if (workingDays.length === 0) {
      return NextResponse.json(
        { message: "Minimal pilih 1 hari masuk kerja" },
        { status: 400 },
      );
    }

    const existing = await prisma.attendanceConfig.findFirst({
      where: { tenantId: scopedTenantId },
      orderBy: { updatedAt: "desc" },
    });

    const data = {
      officeStartTime,
      officeEndTime,
      lateToleranceMinutes,
      lateDeductionAmount,
      overtimeThresholdHours,
      breakEnabled,
      breakFaceCaptureEnabled,
      workingDays,
    };

    const saved = existing
      ? await prisma.attendanceConfig.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.attendanceConfig.create({
          data: {
            ...data,
            ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
          },
        });

    return NextResponse.json({
      message: "Attendance config updated",
      data: saved,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to update attendance config" },
      { status: 500 },
    );
  }
}
