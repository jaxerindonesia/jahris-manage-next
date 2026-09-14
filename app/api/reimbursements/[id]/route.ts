export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { lockReimbursementJournal, syncReimbursementJournal } from "@/lib/helper/reimbursement-journal";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { writeAuditLog } from "@/lib/security/audit-log";
import { uploadBufferToMinio, deleteFromMinio, BUCKET_AVATARS } from "@/lib/minio";
import { validateAttachmentBuffer } from "@/lib/security/file-validation";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "reimbursements", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const item = await prisma.reimbursement.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: {
        user: {
          select: { id: true, name: true, position: true, department: true },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { message: "Reimbursement not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Success", data: item });
  } catch (error) {
    return NextResponse.json(
      { message: "Failed to retrieve reimbursement" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  const p = await params;

  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const body =
      req.headers.get("content-type")?.includes("application/json")
        ? await req.clone().json().catch(() => ({}))
        : null;
    const nextStatus =
      typeof body?.status === "string" ? body.status.toUpperCase() : null;
    const action =
      nextStatus === "APPROVED" || nextStatus === "REJECTED"
        ? "approve"
        : "update";
    const forbid = requirePermission(auth.user, "reimbursements", action);
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const contentType = req.headers.get("content-type") || "";

    const updateData: Prisma.ReimbursementUncheckedUpdateInput = {};
    let removeReceipt = false;
    let newFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      const title = formData.get("title");
      const category = formData.get("category");
      const amount = formData.get("amount");
      const date = formData.get("date");
      const bankName = formData.get("bankName");
      const accountNumber = formData.get("accountNumber");
      const description = formData.get("description");
      const status = formData.get("status");
      const approvedAt = formData.get("approvedAt");
      removeReceipt = formData.get("removeReceipt") === "true";
      newFile = formData.get("file") as File | null;

      if (title !== null) updateData.title = String(title);
      if (category !== null) updateData.category = String(category);
      if (amount !== null) updateData.amount = Number(amount);
      if (date !== null) updateData.date = new Date(date as string);
      if (bankName !== null) updateData.bankName = String(bankName).trim() || null;
      if (accountNumber !== null)
        updateData.accountNumber = String(accountNumber).trim() || null;
      if (description !== null) updateData.description = String(description);
      if (status !== null) updateData.status = String(status);
      if (approvedAt !== null)
        updateData.approvedAt = approvedAt
          ? new Date(approvedAt as string)
          : null;
      updateData.approvedBy = auth.user.id;
    } else {
      const parsedBody = body ?? (await req.json());

      if (parsedBody.title !== undefined) updateData.title = parsedBody.title;
      if (parsedBody.category !== undefined) updateData.category = parsedBody.category;
      if (parsedBody.amount !== undefined) updateData.amount = Number(parsedBody.amount);
      if (parsedBody.date !== undefined) updateData.date = new Date(parsedBody.date);
      if (parsedBody.bankName !== undefined)
        updateData.bankName = String(parsedBody.bankName).trim() || null;
      if (parsedBody.accountNumber !== undefined)
        updateData.accountNumber = String(parsedBody.accountNumber).trim() || null;
      if (parsedBody.description !== undefined)
        updateData.description = parsedBody.description;
      if (parsedBody.status !== undefined) updateData.status = parsedBody.status;
      if (parsedBody.approvedAt !== undefined)
        updateData.approvedAt = parsedBody.approvedAt
          ? new Date(parsedBody.approvedAt)
          : null;

      updateData.approvedBy = auth.user.id;
      removeReceipt = parsedBody.removeReceipt === true;
    }

    const existing = await prisma.reimbursement.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Data tidak ditemukan" },
        { status: 404 },
      );
    }

    if (typeof updateData.status === "string") {
      updateData.status = updateData.status.toUpperCase();
      if (!["PENDING", "APPROVED", "REJECTED"].includes(updateData.status)) {
        return NextResponse.json({ message: "Status reimbursement tidak valid" }, { status: 400 });
      }
      if (updateData.status !== existing.status.toUpperCase()) {
        const approvalForbid = requirePermission(auth.user, "reimbursements", "approve");
        if (approvalForbid) return approvalForbid;
      }
      updateData.approvedAt = updateData.status === "PENDING" ? null : new Date();
    }
    if (typeof updateData.amount === "number" && (!Number.isFinite(updateData.amount) || updateData.amount <= 0)) {
      return NextResponse.json({ message: "Nominal harus lebih dari nol" }, { status: 400 });
    }
    if (updateData.date instanceof Date && Number.isNaN(updateData.date.getTime())) {
      return NextResponse.json({ message: "Tanggal tidak valid" }, { status: 400 });
    }

    let receiptUrl = existing.receiptUrl;

    if (newFile && newFile.size > 0) {
      const bytes = await newFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const validation = validateAttachmentBuffer(
        newFile.name || "",
        newFile.type || "application/octet-stream",
        buffer,
      );
      if (!validation.ok) {
        return NextResponse.json({ message: validation.message }, { status: 415 });
      }

      const fileName = await buildTenantStorageObjectName(
        scopedTenantId,
        "reimbursements",
        `receipt-${p.id}-${Date.now()}-${newFile.name.replace(/\s+/g, "_")}`,
      );
      
      receiptUrl = await uploadBufferToMinio(
        buffer,
        fileName,
        BUCKET_AVATARS,
        validation.contentType,
      );

      
      if (existing.receiptUrl) {
        if (existing.receiptUrl.includes(BUCKET_AVATARS)) {
          await deleteFromMinio(existing.receiptUrl);
        }
      }
    }

    if (removeReceipt) {
      if (existing.receiptUrl) {
        if (existing.receiptUrl.includes(BUCKET_AVATARS)) {
          await deleteFromMinio(existing.receiptUrl);
        }
      }
      receiptUrl = null;
    }

    updateData.receiptUrl = receiptUrl;

    const updated = await prisma.$transaction(async (tx) => {
      await lockReimbursementJournal(tx, existing.tenantId);
      const claim = await tx.reimbursement.update({ where: { id: p.id }, data: updateData });
      await syncReimbursementJournal(tx, claim);
      return claim;
    });

    if (action === "approve") {
      writeAuditLog({
        action:
          nextStatus === "REJECTED"
            ? "reimbursements.reject"
            : "reimbursements.approve",
        status: "success",
        actorUserId: auth.user.id,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        targetType: "reimbursement",
        targetId: updated.id,
        message: `Reimbursement ${nextStatus?.toLowerCase() || "updated"}`,
        metadata: {
          status: updated.status,
          approvedBy: updated.approvedBy,
        },
      });
    }

    return NextResponse.json({
      message: "Reimbursement successfully updated",
      data: updated,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Failed to update reimbursement" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "reimbursements", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.reimbursement.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });
    if (!existing) return NextResponse.json({ message: "Reimbursement not found" }, { status: 404 });

    if (existing.receiptUrl && existing.receiptUrl.includes(BUCKET_AVATARS)) {
      await deleteFromMinio(existing.receiptUrl);
    }

    await prisma.$transaction(async (tx) => {
      await lockReimbursementJournal(tx, existing.tenantId);
      await syncReimbursementJournal(tx, { ...existing, status: "REJECTED" });
      await tx.reimbursement.delete({ where: { id: p.id } });
    });
    return NextResponse.json({ message: "Reimbursement successfully deleted" });
  } catch (error) {
    return NextResponse.json(
      { message: "Failed to delete reimbursement" },
      { status: 500 },
    );
  }
}
