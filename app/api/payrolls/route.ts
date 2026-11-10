export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { createPayrollForUser } from "@/lib/helper/payroll-create";
import { getPayrollSlipAttendance } from "@/lib/helper/payroll-slip-attendance";
import { writeAuditLog } from "@/lib/security/audit-log";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "payrolls", "get-all");
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = searchParams.get("search") || "";
    const month = searchParams.get("month") || "";
    const year = searchParams.get("year") || "";
    const status = searchParams.get("status") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const activeEmployeesOnly = searchParams.get("activeEmployeesOnly") === "true";

    const where: Prisma.PayrollWhereInput = {};
    const scopedTenantId = ensureTenantScope(auth.user);
    if (scopedTenantId) where.tenantId = scopedTenantId;

    if (activeEmployeesOnly) where.user = { status: "active" };

    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: "insensitive" } } },
        { referenceNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(2000, 0, 1);
      start.setHours(0, 0, 0, 0);
      const end = endDate ? new Date(endDate) : new Date(2100, 11, 31);
      end.setHours(23, 59, 59, 999);

      // Collect all (month, year) periods in range
      const periods: { month: number; year: number }[] = [];
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor <= last) {
        periods.push({
          month: cursor.getMonth() + 1,
          year: cursor.getFullYear(),
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            ...periods.map((p) => ({ month: p.month, year: p.year })),
            { createdAt: { gte: start, lte: end } },
          ],
        },
      ];
    } else {
      if (month) {
        where.month = parseInt(month);
      }

      if (year) {
        where.year = parseInt(year);
      }
    }

    if (status) {
      where.status = status;
    }

    const [payrolls, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, position: true, department: true, branch: { select: { id: true, name: true } } },
          },
          componentValues: true,
        },
      }),
      prisma.payroll.count({ where }),
    ]);

    const data = searchParams.get("includeAttendance") === "true"
      ? await Promise.all(payrolls.map(async (payroll) => ({
          ...payroll, attendanceSummary: await getPayrollSlipAttendance(payroll),
        })))
      : payrolls;

    return NextResponse.json({
      message: "Payroll retrieved successfully",
      data,
      total,
      page,
      limit,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve payroll data" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "payrolls", "create");
    if (forbid) return forbid;

    const body = await req.json();

    const {
      userId,
      month,
      year,
      status,
      paidAt,
      componentValues,
      startDate,
      endDate,
      allEmployees,
      branchId,
    } = body;

    if ((startDate && !endDate) || (!startDate && endDate)) {
      return NextResponse.json({ message: "Tanggal mulai dan selesai periode wajib diisi bersama" }, { status: 400 });
    }
    if (startDate && endDate && (Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate)) || startDate > endDate)) {
      return NextResponse.json({ message: "Rentang tanggal payroll tidak valid" }, { status: 400 });
    }

    if ((!userId && !allEmployees) || !month || !year || !status) {
      return NextResponse.json(
        { message: "All payroll fields are required fields" },
        { status: 400 },
      );
    }

    const normalizedMonth = Number(month);
    const normalizedYear = Number(year);
    if (
      !Number.isInteger(normalizedMonth) ||
      normalizedMonth < 1 ||
      normalizedMonth > 12 ||
      !Number.isInteger(normalizedYear) ||
      normalizedYear < 1
    ) {
      return NextResponse.json(
        { message: "Periode payroll tidak valid" },
        { status: 400 },
      );
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    if (allEmployees) {
      const selectedBranchId = typeof branchId === "string" && branchId.trim() ? branchId.trim() : null;
      if (selectedBranchId) {
        const branch = await prisma.branch.findFirst({
          where: { id: selectedBranchId, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
          select: { id: true },
        });
        if (!branch) return NextResponse.json({ message: "Cabang tidak ditemukan atau tidak memiliki akses" }, { status: 404 });
      }
      const employees = await prisma.user.findMany({
        where: {
          deletedAt: null,
          status: "active",
          ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
          ...(selectedBranchId ? { branchId: selectedBranchId } : {}),
          role: { name: { equals: "Karyawan", mode: "insensitive" } },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      let created = 0;
      let skipped = 0;
      const failures: string[] = [];
      for (const employee of employees) {
        try {
          const payroll = await createPayrollForUser({
            tenantId: scopedTenantId,
            userId: employee.id,
            month: normalizedMonth,
            year: normalizedYear,
            status,
            paidAt,
            startDate,
            endDate,
            creatorId: auth.user.id,
          });
          if (payroll) created += 1;
          else skipped += 1;
        } catch {
          failures.push(employee.name);
        }
      }
      await writeAuditLog({
        action: "payrolls.bulk_create",
        status: "success",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: scopedTenantId,
        targetType: "payroll",
        targetId: null,
        message: `Generate payroll massal periode ${normalizedMonth}/${normalizedYear}: ${created} dibuat, ${skipped} dilewati, ${failures.length} gagal`,
        metadata: { month: normalizedMonth, year: normalizedYear, startDate, endDate, branchId: selectedBranchId, created, skipped, failures },
      });
      return NextResponse.json({
        message: `${created} payroll berhasil dibuat${skipped ? `, ${skipped} dilewati karena sudah ada` : ""}${failures.length ? `, ${failures.length} gagal` : ""}.`,
        data: { created, skipped, failed: failures.length, failures },
      }, { status: failures.length && created === 0 ? 422 : 201 });
    }
    const payroll = await createPayrollForUser({
      tenantId: scopedTenantId, userId, month: normalizedMonth, year: normalizedYear,
      status, paidAt, startDate, endDate, componentValues, creatorId: auth.user.id,
    });
    if (!payroll) {
      return NextResponse.json({ message: "Payroll already exists for this user" }, { status: 409 });
    }
    await writeAuditLog({
      action: "payrolls.create",
      status: "success",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: payroll.tenantId,
      targetType: "payroll",
      targetId: payroll.id,
      message: `Membuat payroll ${payroll.referenceNumber ?? payroll.id} periode ${normalizedMonth}/${normalizedYear}`,
      metadata: { after: payroll },
    });
    return NextResponse.json({ message: "Payroll successfully created.", data: payroll }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/payrolls] Failed to create payroll:", error);
    return NextResponse.json(
      { message: "Failed to create payroll" },
      { status: 500 },
    );
  }
}
