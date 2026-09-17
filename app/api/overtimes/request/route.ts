export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { requestOvertimeFromAttendance } from "./from-attendance";
import { getOvertimeApproverIds } from "@/lib/helper/overtime-approvers";

function getOvertimeDate(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "overtimes", "create");
    if (forbid) return forbid;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      return await requestOvertimeFromAttendance(req, auth.user);
    }

    const body = await req.json();
    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdmin = ["superadmin", "admin"].includes(normalizedRole);
    const overtimeDate = String(body.overtimeDate || "").trim();
    const description = String(body.description || "").trim();
    const requestedUserId = String(body.userId || "").trim();

    const scopedTenantId = ensureTenantScope(auth.user);
    const finalUserId = isAdmin && requestedUserId ? requestedUserId : auth.user.id;
    const finalTenantId = scopedTenantId ?? null;

    if (!overtimeDate) {
      return NextResponse.json(
        { message: "Tanggal lembur wajib diisi" },
        { status: 400 },
      );
    }

    const overtimeDateValue = getOvertimeDate(overtimeDate);
    if (Number.isNaN(overtimeDateValue.getTime())) {
      return NextResponse.json(
        { message: "Format tanggal lembur tidak valid" },
        { status: 400 },
      );
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        id: finalUserId,
        deletedAt: null,
        ...(finalTenantId ? { tenantId: finalTenantId } : {}),
      },
      select: { id: true },
    });
    if (!targetUser) {
      return NextResponse.json(
        { message: "User target tidak ditemukan" },
        { status: 404 },
      );
    }

    const existing = await prisma.overtime.findFirst({
      where: {
        userId: finalUserId,
        ...(finalTenantId ? { tenantId: finalTenantId } : { tenantId: null }),
        overtimeDate: overtimeDateValue,
        status: { in: ["DRAFT", "CHECKED_IN", "PENDING"] },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { message: "Sudah ada pengajuan lembur aktif pada tanggal tersebut" },
        { status: 409 },
      );
    }

    const approverUserIds = await getOvertimeApproverIds(prisma, finalTenantId);
    if (approverUserIds.length === 0) {
      return NextResponse.json(
        { message: "Belum ada approver lembur yang dikonfigurasi" },
        { status: 400 },
      );
    }

    const overtime = await prisma.overtime.create({
      data: {
        tenantId: finalTenantId,
        userId: finalUserId,
        attendanceId: null,
        overtimeDate: overtimeDateValue,
        startTime: null,
        endTime: null,
        overtimeMinutes: 0,
        requestedMinutes: 0,
        description: description || null,
        payMethod: "PER_HOUR",
        hourlyRate: 0,
        dailyRate: 0,
        payoutAmount: 0,
        status: "DRAFT",
        approvalDecisions: {
          createMany: {
            data: approverUserIds.map((approverUserId) => ({
              approverUserId,
              status: "PENDING",
            })),
          },
        },
      },
      include: {
        user: { select: { id: true, name: true } },
        attendance: { select: { id: true, date: true, checkIn: true, checkOut: true } },
        approvalDecisions: {
          include: { approverUser: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json(
      { message: "Pengajuan lembur berhasil dibuat", data: overtime },
      { status: 201 },
    );
  } catch (error) {
    console.error("CREATE OVERTIME REQUEST ERROR:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Gagal mengajukan lembur",
      },
      { status: 500 },
    );
  }
}
