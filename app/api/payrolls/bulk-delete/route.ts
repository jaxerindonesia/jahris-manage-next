export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { lockPayrollJournal } from "@/lib/helper/payroll-journal";

export async function DELETE(req: Request) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "payrolls", "delete");
    if (forbid) return forbid;

    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && id.length > 0))]
      : [];

    if (!ids.length) {
      return NextResponse.json({ message: "Pilih minimal satu payroll" }, { status: 400 });
    }
    if (ids.length > 500) {
      return NextResponse.json({ message: "Maksimal 500 payroll dalam sekali hapus" }, { status: 400 });
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    const payrolls = await prisma.payroll.findMany({
      where: { id: { in: ids }, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true, tenantId: true },
    });

    if (!payrolls.length) {
      return NextResponse.json({ message: "Payroll tidak ditemukan atau tidak dapat diakses" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const tenantIds = [...new Set(payrolls.map((item) => item.tenantId))];
      for (const tenantId of tenantIds) await lockPayrollJournal(tx, tenantId);
      const accessibleIds = payrolls.map((item) => item.id);
      await tx.journal.updateMany({
        where: { journalNo: { in: accessibleIds.map((id) => `AUTO-PYR-${id}`) } },
        data: { status: "VOID" },
      });
      await tx.payroll.deleteMany({ where: { id: { in: accessibleIds } } });
    });

    return NextResponse.json({
      message: `${payrolls.length} payroll berhasil dihapus`,
      deletedCount: payrolls.length,
    });
  } catch (error) {
    console.error("Error bulk deleting payroll:", error);
    return NextResponse.json({ message: "Gagal menghapus payroll terpilih" }, { status: 500 });
  }
}
