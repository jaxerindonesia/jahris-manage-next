export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";

export async function GET() {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;

    const scopedTenantId = ensureTenantScope(auth.user);
    const attendances = await prisma.attendance.findMany({
      where: {
        userId: auth.user.id,
        checkIn: { not: null },
        checkOut: { not: null },
        ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
        overtimes: { none: {} },
      },
      orderBy: { date: "desc" },
      take: 100,
      select: {
        id: true,
        date: true,
        checkIn: true,
        checkOut: true,
        notes: true,
      },
    });

    return NextResponse.json({
      message: "Overtime request options retrieved successfully",
      data: attendances,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to retrieve overtime request options",
      },
      { status: 500 },
    );
  }
}
