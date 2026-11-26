export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "activity-logs", "get-all");
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const search = searchParams.get("search")?.trim() || "";
    const moduleName = searchParams.get("module")?.trim() || "";
    const tenantIdParam = searchParams.get("tenantId")?.trim() || "";

    const scopedTenantId = ensureTenantScope(auth.user);
    const tenantId = scopedTenantId ?? tenantIdParam;

    const where: Prisma.ActivityLogWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(moduleName ? { action: { startsWith: `${moduleName}.` } } : {}),
      ...(search
        ? {
            OR: [
              { message: { contains: search, mode: "insensitive" } },
              { actorName: { contains: search, mode: "insensitive" } },
              { targetId: search },
            ],
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    const tenantIds = [...new Set(logs.map((log) => log.tenantId).filter((id): id is string => !!id))];
    const tenants = scopedTenantId || tenantIds.length === 0
      ? []
      : await prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, companyName: true },
        });
    const tenantNameById = new Map(tenants.map((tenant) => [tenant.id, tenant.companyName]));

    return NextResponse.json({
      message: "Activity logs retrieved successfully",
      data: logs.map((log) => ({
        ...log,
        tenantName: log.tenantId ? tenantNameById.get(log.tenantId) ?? null : null,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("GET ACTIVITY LOGS ERROR:", error);
    return NextResponse.json(
      { message: "Failed to retrieve activity logs" },
      { status: 500 },
    );
  }
}
