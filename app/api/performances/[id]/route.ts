export const runtime = "nodejs";

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { buildPerformanceKpi } from "@/lib/helper/performance-kpi";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "performances", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const performance = await prisma.performance.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            position: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!performance) {
      return NextResponse.json(
        { message: "Performance not found" },
        { status: 404 }
      );
    }

    const kpi = await buildPerformanceKpi({
      tenantId: performance.tenantId,
      userId: performance.userId,
      period: performance.period,
    });

    return NextResponse.json({
      ...performance,
      kpiBreakdown: kpi.kpiBreakdown,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve performance" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  const p = await params;

  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "performances", "update");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const body = await req.json();
    const existing = await prisma.performance.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Performance not found" },
        { status: 404 }
      );
    }

    const nextUserId = body.userId || existing.userId;
    const nextPeriod = body.period || existing.period;
    const nextTenantId = existing.tenantId ?? scopedTenantId ?? null;

    if (!nextUserId || !nextPeriod) {
      return NextResponse.json(
        { message: "User dan periode wajib diisi" },
        { status: 400 },
      );
    }

    const duplicate = await prisma.performance.findFirst({
      where: {
        id: { not: p.id },
        userId: nextUserId,
        period: nextPeriod,
        ...(nextTenantId ? { tenantId: nextTenantId } : { tenantId: null }),
      },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json(
        { message: "Performance already exists for this user" },
        { status: 409 },
      );
    }

    const generatedKpi = await buildPerformanceKpi({
      tenantId: nextTenantId,
      userId: nextUserId,
      period: nextPeriod,
    });

    const updateData = {
      userId: nextUserId,
      period: generatedKpi.period,
      productivity: generatedKpi.productivity,
      quality: generatedKpi.quality,
      teamwork: generatedKpi.teamwork,
      discipline: generatedKpi.discipline,
      totalScore: generatedKpi.totalScore,
      notes: body.notes ?? existing.notes,
      evaluatedBy: body.evaluatedBy || existing.evaluatedBy,
      evaluatedAt: new Date(),
    };

    const performance = await prisma.performance.update({
      where: { id: p.id },
      data: updateData,
    });

    return NextResponse.json({
      message: "Performance successfully updated",
      data: {
        ...performance,
        kpiBreakdown: generatedKpi.kpiBreakdown,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Failed to update performance" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "performances", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.performance.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: "Performance not found" }, { status: 404 });

    await prisma.performance.delete({
      where: { id: p.id },
    });

    return NextResponse.json({
      message: "Performance successfully deleted",
    });
  } catch (error) {
    console.error("Error deleting performance:", error);
    return NextResponse.json(
      { message: "Failed to delete performance" },
      { status: 500 }
    );
  }
}
