export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import {
  AUTO_LATE_DEDUCTION_COMPONENT_NAME,
  AUTO_ABSENT_DEDUCTION_COMPONENT_NAME,
  AUTO_OVERTIME_COMPONENT_NAME,
} from "@/lib/constants/payroll";
import {
  getApprovedOvertimePayoutSummary,
} from "@/lib/helper/payroll-overtime";
import { getPayrollSalarySummary } from "@/lib/helper/payroll-salary";

function normalizeComponentValues(items: unknown[], basicSalary: number) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const row = item as Record<string, unknown>;
    const inputTypeSnapshot = String(row.inputTypeSnapshot || row.inputType || "MANUAL").toUpperCase();
    const baseValue =
      inputTypeSnapshot === "PERCENTAGE"
        ? Number(row.baseValue ?? row.amount ?? 0)
        : null;
    const amount =
      inputTypeSnapshot === "PERCENTAGE"
        ? (basicSalary * Number(row.baseValue ?? row.amount ?? 0)) / 100
        : Number(row.amount || 0);

    return {
      componentConfigId: row.componentConfigId ? String(row.componentConfigId) : null,
      nameSnapshot: String(row.nameSnapshot || row.name || "").trim(),
      typeSnapshot: String(row.typeSnapshot || row.type || "").toUpperCase(),
      inputTypeSnapshot,
      amount: Number.isFinite(amount) ? amount : 0,
      baseValue: baseValue !== null && Number.isFinite(baseValue) ? baseValue : null,
    };
  }).filter((item) =>
    item.nameSnapshot &&
    item.nameSnapshot !== AUTO_OVERTIME_COMPONENT_NAME &&
    item.nameSnapshot !== AUTO_LATE_DEDUCTION_COMPONENT_NAME &&
    item.nameSnapshot !== AUTO_ABSENT_DEDUCTION_COMPONENT_NAME &&
    ["EARNING", "DEDUCTION"].includes(item.typeSnapshot),
  );
}

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
          select: { id: true, name: true, position: true, department: true },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { message: "Payroll not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Success", data: item });
  } catch (error) {
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
      select: { id: true, userId: true, month: true, year: true, tenantId: true },
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
    const salarySummary = await getPayrollSalarySummary({
      tenantId: targetTenantId,
      userId: targetUserId,
      month: targetMonth,
      year: targetYear,
    });
    const basicSalary = salarySummary.basicSalary;
    const componentValues = normalizeComponentValues(body.componentValues, basicSalary);
    const overtimeSummary = await getApprovedOvertimePayoutSummary({
      tenantId: salarySummary.tenantId,
      userId: targetUserId,
      month: targetMonth,
      year: targetYear,
    });
    if (overtimeSummary.totalAmount > 0) {
      componentValues.push({
        componentConfigId: null,
        nameSnapshot: AUTO_OVERTIME_COMPONENT_NAME,
        typeSnapshot: "EARNING",
        inputTypeSnapshot: "FIXED",
        amount: overtimeSummary.totalAmount,
        baseValue: null,
      });
    }
    if (salarySummary.lateDeductionAmount > 0) {
      componentValues.push({
        componentConfigId: null,
        nameSnapshot: AUTO_LATE_DEDUCTION_COMPONENT_NAME,
        typeSnapshot: "DEDUCTION",
        inputTypeSnapshot: "FIXED",
        amount: salarySummary.lateDeductionAmount,
        baseValue: null,
      });
    }
    if (salarySummary.absentDeductionAmount > 0) {
      componentValues.push({
        componentConfigId: null,
        nameSnapshot: AUTO_ABSENT_DEDUCTION_COMPONENT_NAME,
        typeSnapshot: "DEDUCTION",
        inputTypeSnapshot: "FIXED",
        amount: salarySummary.absentDeductionAmount,
        baseValue: null,
      });
    }
    const allowances = componentValues
      .filter((item) => item.typeSnapshot === "EARNING")
      .reduce((sum, item) => sum + item.amount, 0);
    const deductions = componentValues
      .filter((item) => item.typeSnapshot === "DEDUCTION")
      .reduce((sum, item) => sum + item.amount, 0);
    const totalSalary = basicSalary + allowances - deductions;

    updateData.totalSalary = totalSalary;
    updateData.tenantId = salarySummary.tenantId;

    if (body.month !== undefined) updateData.month = targetMonth;
    if (body.year !== undefined) updateData.year = targetYear;
    if (body.userId !== undefined) updateData.userId = targetUserId;
    updateData.basicSalary = basicSalary;
    updateData.salaryType = salarySummary.salaryType;
    updateData.salaryRate = salarySummary.salaryRate;
    updateData.paidAttendanceDays = salarySummary.paidAttendanceDays;
    updateData.lateDeductionRate = salarySummary.lateDeductionRate;
    updateData.lateAttendanceDays = salarySummary.lateAttendanceDays;
    updateData.lateDeductionAmount = salarySummary.lateDeductionAmount;
    updateData.allowances = allowances;
    updateData.deductions = deductions;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.paidAt) updateData.paidAt = new Date(body.paidAt);

    const [payroll] = await prisma.$transaction([
      prisma.payroll.update({
        where: { id: p.id },
        data: updateData,
      }),
      prisma.payrollComponentValue.deleteMany({
        where: { payrollId: p.id },
      }),
      ...(componentValues.length > 0
        ? [
            prisma.payrollComponentValue.createMany({
              data: componentValues.map((item) => ({
                payrollId: p.id,
                componentConfigId: item.componentConfigId,
                nameSnapshot: item.nameSnapshot,
                typeSnapshot: item.typeSnapshot,
                inputTypeSnapshot: item.inputTypeSnapshot,
                amount: item.amount,
                baseValue: item.baseValue,
              })),
            }),
          ]
        : []),
    ]);

    return NextResponse.json({
      message: "Payroll successfully updated",
      data: {
        ...payroll,
        componentValues,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Failed to update payroll" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "payrolls", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.payroll.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: "Payroll not found" }, { status: 404 });

    await prisma.payroll.delete({
      where: { id: p.id },
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
