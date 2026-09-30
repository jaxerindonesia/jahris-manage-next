export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { getJakartaDayKey } from "@/lib/helper/date";
import { requirePermission } from "@/lib/auth/permission";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "attendances", "get-all");
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const activeEmployeesOnly = searchParams.get("activeEmployeesOnly") === "true";

    const where: Prisma.AttendanceWhereInput = {};
    const scopedTenantId = ensureTenantScope(auth.user);
    if (scopedTenantId) where.tenantId = scopedTenantId;
    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdminRole = normalizedRole !== "karyawan";
    if (!isAdminRole) where.userId = auth.user.id;
    if (activeEmployeesOnly) where.user = { status: "active" };
    
    if (search) {
      where.user = {
        ...(activeEmployeesOnly ? { status: "active" } : {}),
        name: { contains: search, mode: "insensitive" },
      };
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [attendances, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.attendance.count({ where }),
    ]);

    return NextResponse.json({
      message: "Attendances retrieved successfully",
      data: attendances,
      total,
      page,
      limit,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve attendances data" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "attendances", "create");
    if (forbid) return forbid;

    const body = await req.json();

    const { userId, date, checkIn, checkOut, status, notes } = body;

    if (!userId || !date || !checkIn || !checkOut || !status) {
      return NextResponse.json(
        { message: "All attendance fields are required fields" },
        { status: 400 },
      );
    }

    const attendanceDay = getJakartaDayKey(new Date(date));

    const scopedTenantId = ensureTenantScope(auth.user);
    const finalTenantId = scopedTenantId ?? body.tenantId ?? null;

    const targetUser = await prisma.user.findFirst({
      where: {
        id: userId,
        ...(finalTenantId ? { tenantId: finalTenantId } : { tenantId: null }),
        deletedAt: null,
      },
      select: { id: true, branchId: true },
    });
    if (!targetUser) {
      return NextResponse.json(
        { message: "User tidak valid untuk tenant ini" },
        { status: 400 },
      );
    }

    const existing = await prisma.attendance.findFirst({
      where: {
        userId,
        attendanceDay,
        ...(finalTenantId ? { tenantId: finalTenantId } : {}),
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "Attendance already exists for this user" },
        { status: 409 },
      );
    }

    const attendance = await prisma.attendance.create({
      data: {
        tenantId: finalTenantId,
        branchId: targetUser.branchId,
        userId,
        date: new Date(date),
        attendanceDay,
        checkIn,
        checkOut,
        status,
        notes,
      },
    });

    return NextResponse.json(
      {
        message: "Attendance successfully created.",
        data: attendance,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("P2002") || message.includes("Unique constraint")) {
      return NextResponse.json(
        { message: "Attendance already exists for this user" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "Failed to create attendance" },
      { status: 500 },
    );
  }
}
