export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { buildPerformanceKpi } from "@/lib/helper/performance-kpi";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "performances", "get-all");
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = searchParams.get("search") || "";
    const period = searchParams.get("period") || "";
    const scoreFilter = searchParams.get("score") || "";

    const where: Prisma.PerformanceWhereInput = {};
    const scopedTenantId = ensureTenantScope(auth.user);
    if (scopedTenantId) where.tenantId = scopedTenantId;

    if (search) {
      where.user = {
        name: { contains: search, mode: "insensitive" },
      };
    }

    if (period) {
      where.period = period;
    }

    if (scoreFilter) {
      if (scoreFilter === "excellent") where.totalScore = { gte: 4.5 };
      else if (scoreFilter === "good") where.totalScore = { gte: 3.5, lt: 4.5 };
      else if (scoreFilter === "fair") where.totalScore = { gte: 2.5, lt: 3.5 };
      else if (scoreFilter === "poor") where.totalScore = { lt: 2.5 };
    }

    const [performances, total] = await Promise.all([
      prisma.performance.findMany({
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
      prisma.performance.count({ where }),
    ]);

    return NextResponse.json({
      message: "Performance retrieved successfully",
      data: performances,
      total,
      page,
      limit,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve performance data" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "performances", "create");
    if (forbid) return forbid;

    const body = await req.json();

    const { userId, period, notes, evaluatedBy } = body;

    if (!userId || !period || !evaluatedBy) {
      return NextResponse.json(
        { message: "User, periode, dan evaluator wajib diisi" },
        { status: 400 },
      );
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    const finalTenantId = scopedTenantId ?? body.tenantId ?? null;

    const existing = await prisma.performance.findFirst({
      where: { userId: userId, period: period, ...(finalTenantId ? { tenantId: finalTenantId } : {}) },
    });

    if (existing) {
      return NextResponse.json(
        { message: "Performance already exists for this user" },
        { status: 409 },
      );
    }

    const generatedKpi = await buildPerformanceKpi({
      tenantId: finalTenantId,
      userId,
      period,
    });

    const performance = await prisma.performance.create({
      data: {
        tenantId: finalTenantId,
        userId,
        period: generatedKpi.period,
        productivity: generatedKpi.productivity,
        quality: generatedKpi.quality,
        teamwork: generatedKpi.teamwork,
        discipline: generatedKpi.discipline,
        totalScore: generatedKpi.totalScore,
        notes,
        evaluatedBy,
        evaluatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        message: "Performance successfully created.",
        data: {
          ...performance,
          kpiBreakdown: generatedKpi.kpiBreakdown,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Failed to create performance" },
      { status: 500 },
    );
  }
}
