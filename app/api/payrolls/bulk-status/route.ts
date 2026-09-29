export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { lockPayrollJournal, syncPayrollJournal } from "@/lib/helper/payroll-journal";

const SAFE_JOURNAL_ERRORS = [
  "Total pembayaran payroll harus lebih dari nol",
  "Tenant karyawan tidak sesuai dengan payroll",
];

function getSafeBulkStatusError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (SAFE_JOURNAL_ERRORS.includes(error.message)) return error.message;
  if (/^Konfigurasi akun .+ tidak sesuai untuk jurnal payroll$/.test(error.message)) return error.message;
  return null;
}

export async function PUT(req: Request) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "payrolls", "update");
    if (forbid) return forbid;

    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; status?: unknown };
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && id.length > 0))]
      : [];
    if (!ids.length) return NextResponse.json({ message: "Pilih minimal satu payroll" }, { status: 400 });
    if (ids.length > 500) return NextResponse.json({ message: "Maksimal 500 payroll dalam sekali update" }, { status: 400 });
    if (body.status !== "PAID") return NextResponse.json({ message: "Status tujuan tidak valid" }, { status: 400 });

    const scopedTenantId = ensureTenantScope(auth.user);
    const payrolls = await prisma.payroll.findMany({
      where: { id: { in: ids }, status: "PENDING", ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });
    if (!payrolls.length) {
      return NextResponse.json({ message: "Tidak ada payroll Pending yang dapat diperbarui" }, { status: 400 });
    }

    const invalidAmountCount = payrolls.filter((payroll) => !Number.isFinite(payroll.totalSalary) || payroll.totalSalary <= 0).length;
    if (invalidAmountCount > 0) {
      return NextResponse.json(
        {
          message: `${invalidAmountCount} payroll memiliki total pembayaran Rp 0. Perbaiki nominal payroll sebelum ditandai Dibayar.`,
        },
        { status: 422 },
      );
    }

    const paidAt = new Date();
    const updatedIds: string[] = [];
    await prisma.$transaction(
      async (tx) => {
        const tenantIds = [...new Set(payrolls.map((item) => item.tenantId))];
        for (const tenantId of tenantIds) await lockPayrollJournal(tx, tenantId);
        for (const payroll of payrolls) {
          const updated = await tx.payroll.update({
            where: { id: payroll.id },
            data: { status: "PAID", paidAt },
          });
          await syncPayrollJournal(tx, updated, auth.user.id);
          updatedIds.push(updated.id);
        }
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    return NextResponse.json({
      message: `${updatedIds.length} payroll berhasil ditandai sebagai Dibayar`,
      updatedCount: updatedIds.length,
      skippedCount: ids.length - updatedIds.length,
      updatedIds,
      paidAt: paidAt.toISOString(),
    });
  } catch (error) {
    console.error("Error bulk updating payroll status:", error);
    const safeMessage = getSafeBulkStatusError(error);
    if (safeMessage) {
      return NextResponse.json({ message: safeMessage }, { status: 422 });
    }
    return NextResponse.json({ message: "Gagal memperbarui status payroll terpilih" }, { status: 500 });
  }
}
