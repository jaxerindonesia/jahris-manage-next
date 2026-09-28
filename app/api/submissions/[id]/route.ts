export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { syncSubmissionAttendanceForRange } from "@/lib/helper/submission-attendance";
import { uploadBufferToMinio, deleteFromMinio, BUCKET_AVATARS } from "@/lib/minio";
import { writeAuditLog } from "@/lib/security/audit-log";
import { validateAttachmentBuffer } from "@/lib/security/file-validation";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "submissions", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const submission = await prisma.submission.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: {
        submissionType: { include: { approverConfigs: { include: { approverUser: { select: { id: true, name: true } } } } } },
        approvalDecisions: true,
      },
    });

    if (!submission) return NextResponse.json({ message: "Submission not found" }, { status: 404 });
    return NextResponse.json({ message: "Success", data: submission });
  } catch {
    return NextResponse.json({ message: "Failed to retrieve submission" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "submissions", "update");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.submission.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: { submissionType: { include: { approverConfigs: true } }, approvalDecisions: true },
    });
    if (!existing) return NextResponse.json({ message: "Submission not found" }, { status: 404 });

    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    const body = isMultipart ? null : await req.json();

    if (body?.approvalAction) {
      const approverUserId = auth.user.id;
      const allowed = existing.submissionType.approverConfigs.some((c) => c.approverUserId === approverUserId);
      if (!allowed) return NextResponse.json({ message: "Anda tidak memiliki akses approval pada submission ini" }, { status: 403 });

      const nextStatus = body.approvalAction === "APPROVE" ? "APPROVED" : "REJECTED";
      const rejectReason = nextStatus === "REJECTED" ? (body.rejectionReason || "") : null;
      if (nextStatus === "REJECTED" && !rejectReason) return NextResponse.json({ message: "Alasan penolakan wajib diisi" }, { status: 400 });

      await prisma.submissionApprovalDecision.upsert({
        where: { submissionId_approverUserId: { submissionId: p.id, approverUserId } },
        create: { submissionId: p.id, approverUserId, status: nextStatus, reason: rejectReason, decidedAt: new Date() },
        update: { status: nextStatus, reason: rejectReason, decidedAt: new Date() },
      });

      const allDecisions = await prisma.submissionApprovalDecision.findMany({ where: { submissionId: p.id } });
      const hasRejected = allDecisions.some((d) => d.status === "REJECTED");
      const allApproved =
        existing.submissionType.approverConfigs.length > 0 &&
        allDecisions.length >= existing.submissionType.approverConfigs.length &&
        allDecisions.every((d) => d.status === "APPROVED");

      const finalStatus = hasRejected ? "REJECTED" : allApproved ? "APPROVED" : "PENDING";
      const lastApproverId =
        finalStatus === "APPROVED" || finalStatus === "REJECTED" ? approverUserId : null;

      const updated = await prisma.submission.update({
        where: { id: p.id },
        data: {
          status: finalStatus,
          approvedBy: lastApproverId,
          approvedAt: finalStatus === "PENDING" ? null : new Date(),
        },
      });

      await syncSubmissionAttendanceForRange({
        userId: existing.userId,
        tenantId: existing.tenantId,
        startDate: existing.startDate,
        endDate: existing.endDate,
      });

      writeAuditLog({
        action: nextStatus === "REJECTED" ? "submissions.reject" : "submissions.approve",
        status: "success",
        actorUserId: auth.user.id,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        targetType: "submission",
        targetId: updated.id,
        message: `Submission ${nextStatus.toLowerCase()}`,
        metadata: {
          finalStatus,
          rejectReason,
        },
      });

      return NextResponse.json({ message: "Approval berhasil diproses", data: updated });
    }

    const updateData: Prisma.SubmissionUncheckedUpdateInput = {};
    let removeProof = false;
    let newFile: File | null = null;
    let nextStartDate: Date | null = null;
    let nextEndDate: Date | null = null;

    if (isMultipart) {
      const formData = await req.formData();
      const userId = formData.get("userId");
      const submissionTypeId = formData.get("submissionTypeId");
      const startDate = formData.get("startDate");
      const endDate = formData.get("endDate");
      const reason = formData.get("reason");
      const status = formData.get("status");

      nextStartDate = startDate ? new Date(String(startDate)) : null;
      nextEndDate = endDate ? new Date(String(endDate)) : null;
      removeProof = formData.get("removeProof") === "true";
      newFile = formData.get("file") as File | null;

      if (userId) updateData.userId = String(userId);
      if (submissionTypeId) updateData.submissionTypeId = String(submissionTypeId);
      if (startDate && nextStartDate) updateData.startDate = nextStartDate;
      if (endDate && nextEndDate) updateData.endDate = nextEndDate;
      if (reason !== null) updateData.reason = String(reason);
      if (status) updateData.status = String(status);
    } else {
      nextStartDate = body.startDate ? new Date(body.startDate) : null;
      nextEndDate = body.endDate ? new Date(body.endDate) : null;

      if (body.userId) updateData.userId = body.userId;
      if (body.submissionTypeId) updateData.submissionTypeId = body.submissionTypeId;
      if (body.startDate && nextStartDate) updateData.startDate = nextStartDate;
      if (body.endDate && nextEndDate) updateData.endDate = nextEndDate;
      if (body.reason !== undefined) updateData.reason = body.reason;
      if (body.status !== undefined) updateData.status = body.status;
      removeProof = body.removeProof === true;
    }

    if (nextStartDate && Number.isNaN(nextStartDate.getTime())) {
      return NextResponse.json({ message: "Format tanggal mulai tidak valid" }, { status: 400 });
    }
    if (nextEndDate && Number.isNaN(nextEndDate.getTime())) {
      return NextResponse.json({ message: "Format tanggal selesai tidak valid" }, { status: 400 });
    }

    const finalStartDate = nextStartDate ?? existing.startDate;
    const finalEndDate = nextEndDate ?? existing.endDate;
    if (finalEndDate < finalStartDate) {
      return NextResponse.json(
        { message: "Tanggal selesai tidak boleh sebelum tanggal mulai" },
        { status: 400 },
      );
    }

    let proofUrl = existing.proofUrl;

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
        "submissions",
        `proof-${p.id}-${Date.now()}-${newFile.name.replace(/\s+/g, "_")}`,
      );

      proofUrl = await uploadBufferToMinio(
        buffer,
        fileName,
        BUCKET_AVATARS,
        validation.contentType,
      );

      if (existing.proofUrl?.includes(BUCKET_AVATARS)) {
        await deleteFromMinio(existing.proofUrl);
      }
    }

    if (removeProof) {
      if (existing.proofUrl?.includes(BUCKET_AVATARS)) {
        await deleteFromMinio(existing.proofUrl);
      }
      proofUrl = null;
    }

    updateData.proofUrl = proofUrl;

    const submission = await prisma.submission.update({ where: { id: p.id }, data: updateData });

    if (
      existing.status === "APPROVED" ||
      submission.status === "APPROVED"
    ) {
      const syncStartDate =
        existing.startDate < submission.startDate ? existing.startDate : submission.startDate;
      const syncEndDate =
        existing.endDate > submission.endDate ? existing.endDate : submission.endDate;

      await syncSubmissionAttendanceForRange({
        userId: submission.userId,
        tenantId: submission.tenantId,
        startDate: syncStartDate,
        endDate: syncEndDate,
      });

      if (existing.userId !== submission.userId) {
        await syncSubmissionAttendanceForRange({
          userId: existing.userId,
          tenantId: existing.tenantId,
          startDate: syncStartDate,
          endDate: syncEndDate,
        });
      }
    }

    return NextResponse.json({ message: "Submission successfully updated", data: submission });
  } catch {
    return NextResponse.json({ message: "Failed to update submission" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "submissions", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.submission.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        startDate: true,
        endDate: true,
        status: true,
        proofUrl: true,
      },
    });
    if (!existing) return NextResponse.json({ message: "Submission not found" }, { status: 404 });

    if (existing.proofUrl?.includes(BUCKET_AVATARS)) {
      await deleteFromMinio(existing.proofUrl);
    }

    await prisma.submission.delete({ where: { id: p.id } });

    if (existing.status === "APPROVED") {
      await syncSubmissionAttendanceForRange({
        userId: existing.userId,
        tenantId: existing.tenantId,
        startDate: existing.startDate,
        endDate: existing.endDate,
      });
    }

    writeAuditLog({
      action: "submissions.delete",
      status: "success",
      actorUserId: auth.user.id,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "submission",
      targetId: p.id,
      message: "Submission deleted",
    });
    return NextResponse.json({ message: "Submission successfully deleted" });
  } catch {
    return NextResponse.json({ message: "Failed to delete submission" }, { status: 500 });
  }
}
