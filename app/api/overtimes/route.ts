export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { getJakartaDayRange } from "@/lib/helper/date";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "overtimes", "get-all");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = (searchParams.get("search") || "").trim();
    const status = searchParams.get("status") || "";
    const overtimeDate = (searchParams.get("overtimeDate") || "").trim();
    const activeOnly = searchParams.get("activeOnly") === "true";

    const where: Prisma.OvertimeWhereInput = {};
    if (scopedTenantId) where.tenantId = scopedTenantId;
    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    if (!["superadmin", "admin"].includes(normalizedRole)) {
      where.OR = [
        { userId: auth.user.id },
        { approvalDecisions: { some: { approverUserId: auth.user.id } } },
      ];
    }
    if (status) where.status = status;
    if (overtimeDate) {
      const dateValue = new Date(`${overtimeDate}T00:00:00+07:00`);
      if (!Number.isNaN(dateValue.getTime())) {
        const { startUtc, endUtc } = getJakartaDayRange(dateValue);
        const dateFilter = { gte: startUtc, lte: endUtc };
        if (activeOnly) {
          where.AND = [{ OR: [{ overtimeDate: dateFilter }, { status: "CHECKED_IN" }] }];
        } else {
          where.overtimeDate = dateFilter;
        }
      }
    }
    if (activeOnly) {
      where.userId = auth.user.id;
      where.status = { in: ["DRAFT", "CHECKED_IN", "PENDING"] };
    }
    if (search) {
      const currentAnd = Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : [];

      where.AND = [
        ...currentAnd,
        {
          OR: [
            { description: { contains: search, mode: "insensitive" } },
            { user: { name: { contains: search, mode: "insensitive" } } },
          ],
        },
      ];
    }

    const [overtimes, total] = await Promise.all([
      prisma.overtime.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: activeOnly ? [{ status: "asc" }, { createdAt: "desc" }] : { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
          attendance: { select: { id: true, date: true, checkIn: true, checkOut: true } },
          approvalDecisions: {
            include: { approverUser: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.overtime.count({ where }),
    ]);

    return NextResponse.json({ message: "Overtimes retrieved successfully", data: overtimes, total });
  } catch {
    return NextResponse.json({ message: "Failed to retrieve overtimes data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "overtimes", "create");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);
    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdmin = ["superadmin", "admin"].includes(normalizedRole);
    const body = await req.json();
    const overtimeDate = String(body.overtimeDate || "").trim();
    const description = String(body.description || "").trim();
    const requestedUserId = String(body.userId || "").trim();
    const finalUserId = isAdmin && requestedUserId ? requestedUserId : auth.user.id;

    if (!overtimeDate) {
      return NextResponse.json({ message: "Tanggal lembur wajib diisi" }, { status: 400 });
    }

    const overtimeDateValue = new Date(`${overtimeDate}T00:00:00`);
    if (Number.isNaN(overtimeDateValue.getTime())) {
      return NextResponse.json({ message: "Format tanggal lembur tidak valid" }, { status: 400 });
    }

    const existing = await prisma.overtime.findFirst({
      where: {
        userId: finalUserId,
        ...(scopedTenantId ? { tenantId: scopedTenantId } : { tenantId: null }),
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

    const approverConfigs = await prisma.overtimeApproverConfig.findMany({
      where: scopedTenantId ? { tenantId: scopedTenantId } : { tenantId: null },
      select: { approverUserId: true },
    });
    if (!approverConfigs.length) {
      return NextResponse.json(
        { message: "Belum ada approver lembur yang dikonfigurasi" },
        { status: 400 },
      );
    }

    const overtime = await prisma.overtime.create({
      data: {
        tenantId: scopedTenantId,
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
            data: approverConfigs.map((item) => ({
              approverUserId: item.approverUserId,
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

    return NextResponse.json({ message: "Overtime created", data: overtime }, { status: 201 });
  } catch (error) {
    console.error("CREATE OVERTIME ERROR:", error);
    return NextResponse.json({ message: "Failed to create overtime" }, { status: 500 });
  }
}
