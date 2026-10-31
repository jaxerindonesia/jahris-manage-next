export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";

const DEFAULT_CONFIG = {
  payMethod: "PER_HOUR",
  hourlyRate: 0,
  dailyRate: 0,
  hideNominal: false,
};

export async function GET() {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "overtimes", "set-config");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const cfg = await prisma.overtimeConfig.findFirst({
      where: scopedTenantId ? { tenantId: scopedTenantId } : { tenantId: null },
      orderBy: { updatedAt: "desc" },
    });
    const approverConfigs = await prisma.overtimeApproverConfig.findMany({
      where: scopedTenantId ? { tenantId: scopedTenantId } : { tenantId: null },
      orderBy: { createdAt: "asc" },
      include: { approverUser: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ message: "OK", data: { ...(cfg ?? DEFAULT_CONFIG), approverConfigs }, isDefault: !cfg });
  } catch {
    return NextResponse.json({ message: "Failed to fetch overtime config" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "overtimes", "set-config");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);
    const body = await req.json();

    const hourlyRate = Number(body.hourlyRate);
    const dailyRate = Number(body.dailyRate);
    const hideNominal = body.hideNominal === true;
    const approverUserIds = Array.isArray(body.approverUserIds) ? body.approverUserIds : [];

    if (!Number.isFinite(hourlyRate) || hourlyRate < 0 || !Number.isFinite(dailyRate) || dailyRate < 0) {
      return NextResponse.json({ message: "Nominal lembur harus angka >= 0" }, { status: 400 });
    }
    const existing = await prisma.overtimeConfig.findFirst({
      where: scopedTenantId ? { tenantId: scopedTenantId } : { tenantId: null },
      orderBy: { updatedAt: "desc" },
    });

    const data = { payMethod: "PER_HOUR", hourlyRate, dailyRate, hideNominal };
    const saved = existing
      ? await prisma.overtimeConfig.update({ where: { id: existing.id }, data })
      : await prisma.overtimeConfig.create({ data: { ...data, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) } });

    const uniqueApprovers = Array.from(new Set((approverUserIds as string[]).filter(Boolean)));
    let finalApproverUserIds = uniqueApprovers;
    if (finalApproverUserIds.length === 0) {
      const defaultApprovers = await prisma.user.findMany({
        where: {
          ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
          role: { name: { in: ["Admin", "Super Admin"] } },
        },
        select: { id: true },
      });
      finalApproverUserIds = defaultApprovers.map((u) => u.id);
    }
    if (finalApproverUserIds.length === 0) {
      return NextResponse.json({ message: "Tidak ada approver lembur. Pilih minimal satu approver atau tambahkan user Admin." }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.overtimeApproverConfig.deleteMany({ where: scopedTenantId ? { tenantId: scopedTenantId } : { tenantId: null } }),
      prisma.overtimeApproverConfig.createMany({
        data: finalApproverUserIds.map((approverUserId) => ({
          tenantId: scopedTenantId,
          approverUserId,
        })),
      }),
    ]);

    const approverConfigs = await prisma.overtimeApproverConfig.findMany({
      where: scopedTenantId ? { tenantId: scopedTenantId } : { tenantId: null },
      orderBy: { createdAt: "asc" },
      include: { approverUser: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({
      message: "Overtime config updated",
      data: {
        ...saved,
        approverConfigs,
      },
      isDefault: false,
    });
  } catch (error) {
    console.error("OVERTIME CONFIG UPDATE ERROR:", error);
    return NextResponse.json({ message: "Failed to update overtime config" }, { status: 500 });
  }
}
