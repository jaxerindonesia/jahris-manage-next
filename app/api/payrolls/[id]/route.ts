export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { getAutomaticPayrollComponents, getPayrollTotals, normalizePayrollComponentValues } from "@/lib/helper/payroll-components";
import {
  getApprovedOvertimePayoutSummary,
} from "@/lib/helper/payroll-overtime";
import { getPayrollSalarySummary } from "@/lib/helper/payroll-salary";
import { getPayrollSlipAttendance } from "@/lib/helper/payroll-slip-attendance";
import { lockPayrollJournal, syncPayrollJournal } from "@/lib/helper/payroll-journal";
import { writeAuditLog } from "@/lib/security/audit-log";
import { diffActivityLogFields, pickActivityLogFields } from "@/lib/helper/activity-log-diff";

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
    const forbid = requirePermission(auth.user, "payrolls", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const item = await prisma.payroll.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: {
        componentValues: {
          orderBy: { createdAt: "asc" },
        },
        user: {
          select: { id: true, name: true, position: true, department: true, branch: { select: { id: true, name: true } } },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { message: "Payroll not found" },
        { status: 404 }
      );
    }

    const attendanceSummary = await getPayrollSlipAttendance(item);
    return NextResponse.json({ message: "Success", data: { ...item, attendanceSummary } });
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve payroll" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "payrolls", "update");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.payroll.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: { componentValues: true },
    });
    if (!existing) return NextResponse.json({ message: "Payroll not found" }, { status: 404 });

    const body = await req.json();

    const updateData: Prisma.PayrollUncheckedUpdateInput = {};
    const targetUserId = String(body.userId || existing.userId);
    const targetMonth = Number(body.month ?? existing.month);
    const targetYear = Number(body.year ?? existing.year);
    if (
      !Number.isInteger(targetMonth) ||
      targetMonth < 1 ||
      targetMonth > 12 ||
      !Number.isInteger(targetYear) ||
      targetYear < 1
    ) {
      return NextResponse.json(
        { message: "Periode payroll tidak valid" },
        { status: 400 },
      );
    }
    const targetTenantId = scopedTenantId ?? existing.tenantId ?? null;
    const startDate = body.periodStartDate === undefined ? existing.periodStartDate : body.periodStartDate;
    const endDate = body.periodEndDate === undefined ? existing.periodEndDate : body.periodEndDate;
    const salarySummary = await getPayrollSalarySummary({
      tenantId: targetTenantId,
      userId: targetUserId,
      month: targetMonth,
      year: targetYear,
      startDate,
      endDate,
    });
    const basicSalary = salarySummary.basicSalary;
    const componentValues = normalizePayrollComponentValues(body.componentValues ?? existing.componentValues, basicSalary);
    const overtimeSummary = await getApprovedOvertimePayoutSummary({
      tenantId: salarySummary.tenantId,
      userId: targetUserId,
      month: targetMonth,
      year: targetYear,
      startDate,
      endDate,
    });
    componentValues.push(...getAutomaticPayrollComponents(salarySummary, overtimeSummary.totalAmount));
    const { allowances, deductions, totalSalary } = getPayrollTotals(basicSalary, componentValues);

    updateData.totalSalary = totalSalary;
    updateData.tenantId = salarySummary.tenantId;

    if (body.month !== undefined) updateData.month = targetMonth;
    if (body.year !== undefined) updateData.year = targetYear;
    if (body.periodStartDate !== undefined) updateData.periodStartDate = body.periodStartDate ? new Date(`${String(body.periodStartDate).slice(0, 10)}T00:00:00.000Z`) : null;
    if (body.periodEndDate !== undefined) updateData.periodEndDate = body.periodEndDate ? new Date(`${String(body.periodEndDate).slice(0, 10)}T00:00:00.000Z`) : null;
    if (body.userId !== undefined) updateData.userId = targetUserId;
    updateData.basicSalary = basicSalary;
    updateData.salaryType = salarySummary.salaryType;
    updateData.salaryRate = salarySummary.salaryRate;
    updateData.paidAttendanceDays = salarySummary.paidAttendanceDays;
    updateData.lateDeductionRate = salarySummary.lateDeductionRate;
    updateData.lateAttendanceDays = salarySummary.lateAttendanceDays;
    updateData.lateDeductionAmount = salarySummary.lateDeductionAmount;
    updateData.absentAttendanceDays = salarySummary.absentAttendanceDays;
    updateData.absentDeductionAmount = salarySummary.absentDeductionAmount;
    updateData.allowances = allowances;
    updateData.deductions = deductions;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.paidAt) updateData.paidAt = new Date(body.paidAt);

    const payroll = await prisma.$transaction(async (tx) => {
      await lockPayrollJournal(tx, targetTenantId);
      const updated = await tx.payroll.update({ where: { id: p.id }, data: updateData });
      await tx.payrollComponentValue.deleteMany({ where: { payrollId: p.id } });
      if (componentValues.length > 0) {
        await tx.payrollComponentValue.createMany({
          data: componentValues.map((item) => ({
            payrollId: p.id,
            componentConfigId: item.componentConfigId,
            nameSnapshot: item.nameSnapshot,
            typeSnapshot: item.typeSnapshot,
            inputTypeSnapshot: item.inputTypeSnapshot,
            amount: item.amount,
            baseValue: item.baseValue,
          })),
        });
      }
      await syncPayrollJournal(tx, updated, auth.user.id);
      return updated;
    });

    await writeAuditLog({
      action: "payrolls.update",
      status: "success",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: payroll.tenantId,
      targetType: "payroll",
      targetId: payroll.id,
      message: `Mengubah payroll ${payroll.referenceNumber ?? payroll.id}`,
      metadata: { changes: diffActivityLogFields(existing, payroll), componentValues: { from: existing.componentValues, to: componentValues } },
    });

    return NextResponse.json({
      message: "Payroll successfully updated",
      data: {
        ...payroll,
        componentValues,
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to update payroll" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "payrolls", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.payroll.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });
    if (!existing) return NextResponse.json({ message: "Payroll not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await lockPayrollJournal(tx, existing.tenantId);
      await tx.journal.updateMany({
        where: { journalNo: `AUTO-PYR-${existing.id}` },
        data: { status: "VOID" },
      });
      await tx.payroll.delete({ where: { id: p.id } });
    });

    await writeAuditLog({
      action: "payrolls.delete",
      status: "success",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: existing.tenantId,
      targetType: "payroll",
      targetId: existing.id,
      message: `Menghapus payroll ${existing.referenceNumber ?? existing.id}`,
      metadata: { before: pickActivityLogFields(existing) },
    });

    return NextResponse.json({
      message: "Payroll successfully deleted",
    });
  } catch (error) {
    console.error("Error deleting payroll:", error);
    return NextResponse.json(
      { message: "Failed to delete payroll" },
      { status: 500 }
    );
  }
}
