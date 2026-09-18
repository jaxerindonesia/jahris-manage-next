export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission } from "@/lib/auth/permission";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(req: NextRequest, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    
    const isOwnData = auth.user.id === p.id;
    const canGetAll = hasPermission(auth.user, "attendances", "get-all");
    if (!isOwnData && !canGetAll) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    const scopedTenantId = ensureTenantScope(auth.user);
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const status = searchParams.get("status") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const attendanceDay = searchParams.get("attendanceDay") || "";
    const includeOpen = searchParams.get("includeOpen") === "true";

    const where: Prisma.AttendanceWhereInput = {
      userId: p.id,
      ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
    };

    if (status) {
      where.status = status;
    }

    if (attendanceDay) {
      if (includeOpen) {
        where.OR = [
          { attendanceDay: new Date(attendanceDay) },
          { checkIn: { not: null }, checkOut: null },
        ];
      } else {
        where.attendanceDay = new Date(attendanceDay);
      }
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [attendances, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        orderBy: includeOpen
          ? [{ checkOut: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }]
          : { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
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
