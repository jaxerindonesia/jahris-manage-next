export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { getApprovedOvertimePayoutSummary } from "@/lib/helper/payroll-overtime";
import { getPayrollSalarySummary } from "@/lib/helper/payroll-salary";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "payrolls", "get-all");
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const userId = String(searchParams.get("userId") || "").trim();
    const month = Number(searchParams.get("month") || 0);
    const year = Number(searchParams.get("year") || 0);
    const startDate = searchParams.get("startDate") || null;
    const endDate = searchParams.get("endDate") || null;

    if (!userId || month < 1 || month > 12 || year < 1) {
      return NextResponse.json(
        { message: "userId, month, dan year tidak valid" },
        { status: 400 },
      );
    }

    const tenantId = ensureTenantScope(auth.user);
    const salary = await getPayrollSalarySummary({
      tenantId,
      userId,
      month,
      year,
      startDate,
      endDate,
    });
    const overtime = await getApprovedOvertimePayoutSummary({
      tenantId: salary.tenantId,
      userId,
      month,
      year,
      startDate,
      endDate,
    });

    return NextResponse.json({
      message: "OK",
      data: {
        salaryType: salary.salaryType,
        salaryRate: salary.salaryRate,
        paidAttendanceDays: salary.paidAttendanceDays,
        basicSalary: salary.basicSalary,
        lateDeductionRate: salary.lateDeductionRate,
        lateAttendanceDays: salary.lateAttendanceDays,
        lateDeductionAmount: salary.lateDeductionAmount,
        absentAttendanceDays: salary.absentAttendanceDays,
        absentDeductionAmount: salary.absentDeductionAmount,
        overtimeAmount: overtime.totalAmount,
        overtimeMinutes: overtime.totalMinutes,
        overtimeEntries: overtime.totalEntries,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menghitung payroll";
    return NextResponse.json({ message }, { status: 500 });
  }
}
