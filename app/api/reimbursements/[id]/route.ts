export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getReceiptUrls } from "@/lib/helper/reimbursement";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";
import { lockReimbursementJournal, syncReimbursementJournal } from "@/lib/helper/reimbursement-journal";
import { cleanupReimbursementReceipts, prepareReimbursementDetails, ReimbursementInputError } from "@/lib/helper/reimbursement-details";

type Params = { params: Promise<{ id: string }> };
const includeDetails = { details: { orderBy: { position: "asc" as const } } };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "reimbursements", "get-by-id");
    if (forbid) return forbid;
    const tenantId = ensureTenantScope(auth.user);
    const isEmployee = auth.user.roleName.toLowerCase().replace(/\s/g, "") === "karyawan";
    const item = await prisma.reimbursement.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}), ...(isEmployee ? { userId: auth.user.id } : {}) },
      include: { ...includeDetails, user: { select: { id: true, name: true, position: true, department: true } } },
    });
    if (!item) return NextResponse.json({ message: "Reimbursement not found" }, { status: 404 });
    return NextResponse.json({ message: "Success", data: item });
  } catch {
    return NextResponse.json({ message: "Failed to retrieve reimbursement" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const uploadedUrls: string[] = [];
  let saved = false;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const multipart = req.headers.get("content-type")?.includes("multipart/form-data");
    const body = multipart ? null : await req.json();
    const status = typeof body?.status === "string" ? body.status.toUpperCase() : null;
    const forbid = requirePermission(auth.user, "reimbursements", multipart ? "update" : "approve");
    if (forbid) return forbid;
    const tenantId = ensureTenantScope(auth.user);
    const existing = await prisma.reimbursement.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) }, include: includeDetails,
    });
    if (!existing) return NextResponse.json({ message: "Data tidak ditemukan" }, { status: 404 });

    const updateData: Prisma.ReimbursementUpdateInput = {};
    let retainedUrls = existing.details.flatMap(getReceiptUrls);
    if (multipart) {
      const form = await req.formData();
      const title = String(form.get("title") || "").trim();
      if (!title) throw new ReimbursementInputError("Judul klaim wajib diisi");
      const userId = String(form.get("userId") || existing.userId);
      if (userId !== existing.userId) {
        const employee = await prisma.user.findFirst({ where: { id: userId, tenantId: existing.tenantId, deletedAt: null } });
        if (!employee) throw new ReimbursementInputError("Karyawan tidak ditemukan dalam perusahaan ini");
        updateData.user = { connect: { id: userId } };
      }
      const priorDetails = existing.details.length ? existing.details : [{ receiptUrl: existing.receiptUrl }];
      const { details, ...summary } = await prepareReimbursementDetails(form, existing.tenantId, uploadedUrls, priorDetails);
      Object.assign(updateData, summary, {
        title,
        bankName: String(form.get("bankName") || "").trim() || null,
        accountNumber: String(form.get("accountNumber") || "").trim() || null,
        description: String(form.get("description") || "").trim() || null,
        details: { deleteMany: {}, create: details },
      });
      retainedUrls = details.flatMap(getReceiptUrls);
    } else {
      if (!status || !["PENDING", "APPROVED", "REJECTED"].includes(status)) {
        throw new ReimbursementInputError("Status reimbursement tidak valid");
      }
      updateData.status = status;
      updateData.approvedAt = status === "PENDING" ? null : new Date();
      updateData.approvedBy = status === "PENDING" ? null : auth.user.id;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await lockReimbursementJournal(tx, existing.tenantId);
      const current = await tx.reimbursement.findUnique({ where: { id } });
      if (!current || current.updatedAt.getTime() !== existing.updatedAt.getTime()) {
        throw new ReimbursementInputError("Klaim telah berubah. Muat ulang sebelum menyimpan kembali.");
      }
      const claim = await tx.reimbursement.update({ where: { id }, data: updateData, include: includeDetails });
      await syncReimbursementJournal(tx, claim);
      return claim;
    });
    saved = true;
    if (multipart) {
      const oldUrls = [existing.receiptUrl, ...existing.details.flatMap(getReceiptUrls)];
      await cleanupReimbursementReceipts(oldUrls.filter((url) => !url || !retainedUrls.includes(url)));
    }
    if (!multipart) {
      writeAuditLog({
        action: status === "REJECTED" ? "reimbursements.reject" : "reimbursements.approve",
        status: "success", actorUserId: auth.user.id, actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId, targetType: "reimbursement", targetId: id,
        message: `Reimbursement ${status?.toLowerCase()}`,
        metadata: { status: updated.status, approvedBy: updated.approvedBy },
      });
    }
    return NextResponse.json({ message: "Reimbursement successfully updated", data: updated });
  } catch (error) {
    if (!saved) await cleanupReimbursementReceipts(uploadedUrls);
    if (error instanceof ReimbursementInputError) return NextResponse.json({ message: error.message }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "Failed to update reimbursement" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "reimbursements", "delete");
    if (forbid) return forbid;
    const tenantId = ensureTenantScope(auth.user);
    const existing = await prisma.$transaction(async (tx) => {
      const claim = await tx.reimbursement.findFirst({ where: { id, ...(tenantId ? { tenantId } : {}) } });
      if (!claim) return null;
      await lockReimbursementJournal(tx, claim.tenantId);
      const current = await tx.reimbursement.findUnique({ where: { id }, include: includeDetails });
      if (!current) return null;
      await syncReimbursementJournal(tx, { ...current, status: "REJECTED" });
      await tx.reimbursement.delete({ where: { id } });
      return current;
    });
    if (!existing) return NextResponse.json({ message: "Reimbursement not found" }, { status: 404 });
    await cleanupReimbursementReceipts([existing.receiptUrl, ...existing.details.flatMap(getReceiptUrls)]);
    return NextResponse.json({ message: "Reimbursement successfully deleted" });
  } catch {
    return NextResponse.json({ message: "Failed to delete reimbursement" }, { status: 500 });
  }
}
