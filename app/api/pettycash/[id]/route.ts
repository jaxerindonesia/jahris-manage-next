export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";
import type { Prisma } from "@prisma/client";
import { lockPettyCashJournal, syncPettyCashJournals } from "@/lib/helper/petty-cash-journal";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "pettycash", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const item = await prisma.pettyCash.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: {
        user: {
          select: { id: true, name: true, position: true, department: true },
        },
        usages: {
          orderBy: { usageDate: "asc" },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { message: "Petty Cash not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Success", data: item });
  } catch (error) {
    console.error("GET petty cash by ID error:", error);
    return NextResponse.json(
      { message: "Failed to retrieve petty cash" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "pettycash", "update");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const body = await req.json();
    const existing = await prisma.pettyCash.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Petty Cash not found" },
        { status: 404 },
      );
    }

    // Allow Admin to edit anything
    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdminRole = normalizedRole !== "karyawan";

    if (!isAdminRole) {
      return NextResponse.json(
        { message: "Forbidden: Only Admin can update petty cash details" },
        { status: 403 },
      );
    }

    const {
      userId,
      purpose,
      category,
      amount,
      transferDate,
      bankName,
      accountNumber,
      status,
    } = body;

    const updateData: Prisma.PettyCashUncheckedUpdateInput = {};
    if (userId !== undefined) updateData.userId = userId;
    if (purpose !== undefined) updateData.purpose = purpose;
    if (category !== undefined) updateData.category = category;
    if (amount !== undefined) updateData.amount = Number(amount);
    if (transferDate !== undefined)
      updateData.transferDate = transferDate ? new Date(transferDate) : null;
    if (bankName !== undefined) updateData.bankName = bankName;
    if (accountNumber !== undefined) updateData.accountNumber = accountNumber;
    if (status !== undefined) updateData.status = status;

    const updated = await prisma.$transaction(async (tx) => {
      await lockPettyCashJournal(tx, existing.tenantId);
      const result = await tx.pettyCash.update({
        where: { id: p.id },
        data: updateData,
        include: {
          user: { select: { id: true, name: true, position: true, department: true } },
          usages: true,
        },
      });
      await syncPettyCashJournals(tx, result, auth.user.id);
      return result;
    });

    writeAuditLog({
      action: "pettycash.update",
      status: "success",
      actorUserId: auth.user.id,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "pettycash",
      targetId: updated.id,
      message: "Petty cash updated",
      metadata: {
        status: updated.status,
        amount: updated.amount,
      },
    });

    return NextResponse.json({
      message: "Petty Cash updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("PUT petty cash error:", error);
    return NextResponse.json(
      { message: "Failed to update petty cash" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "pettycash", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    // Admin only
    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdminRole =
      normalizedRole === "superadmin" || normalizedRole === "admin";

    if (!isAdminRole) {
      return NextResponse.json(
        { message: "Forbidden: Only Admin can delete petty cash" },
        { status: 403 },
      );
    }

    const existing = await prisma.pettyCash.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Petty Cash not found" },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await lockPettyCashJournal(tx, existing.tenantId);
      const usages = await tx.pettyCashUsage.findMany({ where: { pettyCashId: existing.id }, select: { id: true } });
      await tx.journal.updateMany({
        where: {
          journalNo: {
            in: [`AUTO-PC-FUND-${existing.id}`, ...usages.map((usage) => `AUTO-PC-USE-${usage.id}`)],
          },
        },
        data: { status: "VOID" },
      });
      await tx.pettyCash.delete({ where: { id: p.id } });
    });

    writeAuditLog({
      action: "pettycash.delete",
      status: "success",
      actorUserId: auth.user.id,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "pettycash",
      targetId: p.id,
      message: "Petty cash deleted",
    });

    return NextResponse.json({
      message: "Petty Cash deleted successfully",
    });
  } catch (error) {
    console.error("DELETE petty cash error:", error);
    return NextResponse.json(
      { message: "Failed to delete petty cash" },
      { status: 500 },
    );
  }
}
