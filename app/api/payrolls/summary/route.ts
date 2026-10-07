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
    const forbid = requirePermission(auth.user, "payrolls", "get-all");
    if (forbid) return forbid;

    const yearParam = new URL(req.url).searchParams.get("year");
    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1) {
      return NextResponse.json({ message: "Tahun payroll tidak valid" }, { status: 400 });
    }

    const where: Prisma.PayrollWhereInput = { year, deletedAt: null };
    const tenantId = ensureTenantScope(auth.user);
    if (tenantId) where.tenantId = tenantId;

    const [total, paid, pending] = await Promise.all([
      prisma.payroll.aggregate({ where, _sum: { totalSalary: true } }),
      prisma.payroll.aggregate({ where: { ...where, status: "PAID" }, _sum: { totalSalary: true } }),
      prisma.payroll.aggregate({ where: { ...where, status: "PENDING" }, _sum: { totalSalary: true } }),
    ]);

    return NextResponse.json({
      message: "Payroll summary retrieved successfully",
      data: {
        year,
        total: total._sum.totalSalary ?? 0,
        paid: paid._sum.totalSalary ?? 0,
        pending: pending._sum.totalSalary ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ message: "Gagal mengambil ringkasan payroll" }, { status: 500 });
  }
}
