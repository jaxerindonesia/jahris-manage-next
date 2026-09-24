export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { REIMBURSEMENT_JOURNAL_PREFIX } from "@/lib/helper/reimbursement-journal";
import { PETTY_CASH_JOURNAL_PREFIX } from "@/lib/helper/petty-cash-journal";
import { OVERTIME_JOURNAL_PREFIX } from "@/lib/helper/overtime-journal";
import { PAYROLL_JOURNAL_PREFIX } from "@/lib/helper/payroll-journal";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";

type Context = {
  params: Promise<{ id: string }>;
};

function calcTotals(details: Array<{ debit?: number; credit?: number }>) {
  return details.reduce<{ debit: number; credit: number }>(
    (acc, item) => ({
      debit: acc.debit + Number(item.debit || 0),
      credit: acc.credit + Number(item.credit || 0),
    }),
    { debit: 0, credit: 0 },
  );
}

export async function GET(_req: NextRequest, context: Context) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "finance", "get-by-id");
  if (forbid) return forbid;
  const scopedTenantId = ensureTenantScope(auth.user);

  const { id } = await context.params;
  const data = await prisma.journal.findFirst({
    where: {
      id,
      ...(scopedTenantId ? { creator: { tenantId: scopedTenantId } } : {}),
    },
    include: {
      details: { include: { account: true, customer: true, vendor: true } },
      creator: true,
    },
  });
  if (!data) {
    return NextResponse.json({ message: "Jurnal tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest, context: Context) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "finance", "update");
  if (forbid) return forbid;
  const scopedTenantId = ensureTenantScope(auth.user);

  const { id } = await context.params;
  const body = await req.json();
  const journalNo = String(body.journalNo || "").trim();
  if (journalNo.startsWith(REIMBURSEMENT_JOURNAL_PREFIX) || journalNo.startsWith(PETTY_CASH_JOURNAL_PREFIX) || journalNo.startsWith(OVERTIME_JOURNAL_PREFIX) || journalNo.startsWith(PAYROLL_JOURNAL_PREFIX)) {
    return NextResponse.json({ message: "Ubah jurnal otomatis melalui transaksi terkait." }, { status: 409 });
  }
  const details = Array.isArray(body.details) ? body.details : [];
  const totals = calcTotals(details);

  if (!journalNo) {
    return NextResponse.json({ message: "No jurnal wajib diisi." }, { status: 400 });
  }

  const duplicate = await prisma.journal.findFirst({
    where: { journalNo, NOT: { id } },
  });
  if (duplicate) {
    return NextResponse.json({ message: "No jurnal sudah digunakan." }, { status: 409 });
  }

  if (totals.debit !== totals.credit) {
    return NextResponse.json({ message: "Total debit dan credit harus sama." }, { status: 400 });
  }

  const existing = await prisma.journal.findFirst({
    where: {
      id,
      ...(scopedTenantId ? { creator: { tenantId: scopedTenantId } } : {}),
    },
    select: { id: true, journalNo: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Jurnal tidak ditemukan" }, { status: 404 });
  }

  if (existing.journalNo.startsWith(REIMBURSEMENT_JOURNAL_PREFIX) || existing.journalNo.startsWith(PETTY_CASH_JOURNAL_PREFIX) || existing.journalNo.startsWith(OVERTIME_JOURNAL_PREFIX) || existing.journalNo.startsWith(PAYROLL_JOURNAL_PREFIX)) {
    return NextResponse.json({ message: "Ubah jurnal otomatis melalui transaksi terkait." }, { status: 409 });
  }

  await prisma.journalDetail.deleteMany({ where: { journalId: id } });

  const data = await prisma.journal.update({
    where: { id },
    data: {
      journalNo,
      date: new Date(body.date),
      referenceNo: body.referenceNo || null,
      description: body.description || null,
      status: body.status || "DRAFT",
      details: {
        create: details.map((item: { accountId: string; debit?: number; credit?: number; description?: string; customerId?: string; vendorId?: string }) => ({
          accountId: item.accountId,
          debit: Number(item.debit || 0),
          credit: Number(item.credit || 0),
          description: item.description || null,
          customerId: item.customerId || null,
          vendorId: item.vendorId || null,
        })),
      },
    },
    include: { details: true },
  });

  writeAuditLog({
    action: "finance.journals.update",
    status: "success",
    actorUserId: auth.user.id,
    actorRole: auth.user.roleName,
    tenantId: auth.user.tenantId,
    targetType: "journal",
    targetId: data.id,
    message: "Journal updated",
    metadata: {
      journalNo: data.journalNo,
      status: body.status || "DRAFT",
      detailCount: details.length,
    },
  });

  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, context: Context) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "finance", "delete");
  if (forbid) return forbid;
  const scopedTenantId = ensureTenantScope(auth.user);

  const { id } = await context.params;
  const existing = await prisma.journal.findFirst({
    where: {
      id,
      ...(scopedTenantId ? { creator: { tenantId: scopedTenantId } } : {}),
    },
    select: { id: true, journalNo: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Jurnal tidak ditemukan" }, { status: 404 });
  }
  if (existing.journalNo.startsWith(REIMBURSEMENT_JOURNAL_PREFIX) || existing.journalNo.startsWith(PETTY_CASH_JOURNAL_PREFIX) || existing.journalNo.startsWith(OVERTIME_JOURNAL_PREFIX) || existing.journalNo.startsWith(PAYROLL_JOURNAL_PREFIX)) {
    return NextResponse.json({ message: "Hapus jurnal otomatis melalui transaksi terkait." }, { status: 409 });
  }
  await prisma.journal.delete({ where: { id } });

  writeAuditLog({
    action: "finance.journals.delete",
    status: "success",
    actorUserId: auth.user.id,
    actorRole: auth.user.roleName,
    tenantId: auth.user.tenantId,
    targetType: "journal",
    targetId: id,
    message: "Journal deleted",
  });

  return NextResponse.json({ success: true });
}
