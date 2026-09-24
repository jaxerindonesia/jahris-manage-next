export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { BUCKET_AVATARS, deleteFromMinio } from "@/lib/minio";
import { writeAuditLog } from "@/lib/security/audit-log";
import { lockOvertimeJournal, syncOvertimeJournal } from "@/lib/helper/overtime-journal";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "overtimes", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const item = await prisma.overtime.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: {
        user: { select: { id: true, name: true } },
        attendance: { select: { id: true, date: true, checkIn: true, checkOut: true } },
        approvalDecisions: {
          include: { approverUser: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!item) return NextResponse.json({ message: "Overtime not found" }, { status: 404 });
    return NextResponse.json({ message: "Success", data: item });
  } catch {
    return NextResponse.json({ message: "Failed to retrieve overtime" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "overtimes", "update");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);
    const existing = await prisma.overtime.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: { approvalDecisions: true },
    });
    if (!existing) return NextResponse.json({ message: "Overtime not found" }, { status: 404 });

    const body = await req.json();
    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdmin = ["superadmin", "admin"].includes(normalizedRole);
    const isApprover = existing.approvalDecisions.some((decision) => decision.approverUserId === auth.user.id);
    if (!isAdmin && existing.userId !== auth.user.id && !isApprover) {
      return NextResponse.json({ message: "Anda tidak memiliki akses ke overtime ini" }, { status: 403 });
    }
    const updateData: Prisma.OvertimeUncheckedUpdateInput = {};

    const nextOvertimeDate = body.overtimeDate !== undefined
      ? String(body.overtimeDate || "").trim()
      : "";

    if (body.userId !== undefined) {
      if (!isAdmin) {
        return NextResponse.json({ message: "Karyawan tidak dapat mengubah karyawan pada lembur" }, { status: 403 });
      }
      updateData.userId = String(body.userId || "").trim();
    }

    if (nextOvertimeDate) {
      if (existing.status !== "DRAFT") {
        return NextResponse.json(
          { message: "Tanggal lembur hanya bisa diubah sebelum check in" },
          { status: 400 },
        );
      }

      const overtimeDateValue = new Date(`${nextOvertimeDate}T00:00:00`);
      if (Number.isNaN(overtimeDateValue.getTime())) {
        return NextResponse.json(
          { message: "Format tanggal lembur tidak valid" },
          { status: 400 },
        );
      }

      updateData.overtimeDate = overtimeDateValue;
    }

    if (body.description !== undefined) {
      if (!isAdmin && existing.status !== "DRAFT") {
        return NextResponse.json({ message: "Keterangan hanya bisa diubah sebelum check in lembur" }, { status: 400 });
      }
      updateData.description = body.description;
    }
    if (isAdmin && body.status !== undefined) updateData.status = body.status;
    if (isAdmin && body.rejectReason !== undefined) updateData.rejectReason = body.rejectReason;
    if (isAdmin && body.payMethod !== undefined) updateData.payMethod = body.payMethod;
    if (isAdmin && body.hourlyRate !== undefined) updateData.hourlyRate = Number(body.hourlyRate);
    if (isAdmin && body.dailyRate !== undefined) updateData.dailyRate = Number(body.dailyRate);
    if (isAdmin && body.payoutAmount !== undefined) updateData.payoutAmount = Number(body.payoutAmount);

    if (body.approvalAction) {
      const approverUserId = auth.user.id;
      if (!isApprover) return NextResponse.json({ message: "Anda tidak memiliki akses approval overtime" }, { status: 403 });
      if (existing.status !== "PENDING") {
        return NextResponse.json(
          { message: "Approval hanya bisa dilakukan setelah lembur selesai checkout" },
          { status: 409 },
        );
      }
      const action = String(body.approvalAction).toUpperCase();
      const nextStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
      const rejectReason = nextStatus === "REJECTED" ? String(body.rejectionReason || "").trim() : null;
      if (nextStatus === "REJECTED" && !rejectReason) {
        return NextResponse.json({ message: "Alasan penolakan wajib diisi" }, { status: 400 });
      }

      await prisma.overtimeApprovalDecision.upsert({
        where: { overtimeId_approverUserId: { overtimeId: p.id, approverUserId } },
        create: { overtimeId: p.id, approverUserId, status: nextStatus, reason: rejectReason, decidedAt: new Date() },
        update: { status: nextStatus, reason: rejectReason, decidedAt: new Date() },
      });

      const allDecisions = await prisma.overtimeApprovalDecision.findMany({ where: { overtimeId: p.id } });
      const hasRejected = allDecisions.some((decision) => decision.status === "REJECTED");
      const allApproved = allDecisions.length > 0 && allDecisions.every((decision) => decision.status === "APPROVED");
      const finalStatus = hasRejected ? "REJECTED" : allApproved ? "APPROVED" : "PENDING";
      const paymentData: {
        payMethod?: string;
        hourlyRate?: number;
        dailyRate?: number;
        payoutAmount?: number;
      } = {};

      if (allApproved) {
        const overtimeCfg = await prisma.overtimeConfig.findFirst({
          where: scopedTenantId ? { tenantId: scopedTenantId } : {},
          orderBy: { updatedAt: "desc" },
        });
        const payMethod = String(body.payMethod || "").toUpperCase();
        const rate =
          payMethod === "PER_DAY"
            ? Number(overtimeCfg?.dailyRate || 0)
            : Number(overtimeCfg?.hourlyRate || 0);

        if (!["PER_HOUR", "PER_DAY"].includes(payMethod)) {
          return NextResponse.json({ message: "Metode pembayaran lembur wajib dipilih" }, { status: 400 });
        }
        if (!Number.isFinite(rate) || rate <= 0) {
          return NextResponse.json({ message: "Tarif lembur harus diisi sebelum approval terakhir" }, { status: 400 });
        }

        paymentData.payMethod = payMethod;
        paymentData.hourlyRate = payMethod === "PER_HOUR" ? rate : 0;
        paymentData.dailyRate = payMethod === "PER_DAY" ? rate : 0;
        paymentData.payoutAmount =
          payMethod === "PER_DAY"
            ? rate
            : rate * (existing.overtimeMinutes / 60);
      }

      const updated = await prisma.$transaction(async (tx) => {
        await lockOvertimeJournal(tx, existing.tenantId);
        const result = await tx.overtime.update({
          where: { id: p.id },
          data: {
            status: finalStatus,
            approvedBy: approverUserId,
            approvedAt: new Date(),
            rejectReason: hasRejected ? rejectReason : null,
            ...paymentData,
          },
        });
        await syncOvertimeJournal(tx, result, auth.user.id);
        return result;
      });
      writeAuditLog({
        action: nextStatus === "REJECTED" ? "overtimes.reject" : "overtimes.approve",
        status: "success",
        actorUserId: auth.user.id,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        targetType: "overtime",
        targetId: updated.id,
        message: `Overtime ${nextStatus.toLowerCase()}`,
        metadata: {
          finalStatus,
          rejectReason,
          payMethod: paymentData.payMethod ?? null,
        },
      });
      return NextResponse.json({ message: "Approval overtime berhasil diproses", data: updated });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await lockOvertimeJournal(tx, existing.tenantId);
      const result = await tx.overtime.update({ where: { id: p.id }, data: updateData });
      await syncOvertimeJournal(tx, result, auth.user.id);
      return result;
    });
    return NextResponse.json({ message: "Overtime updated", data: updated });
  } catch {
    return NextResponse.json({ message: "Failed to update overtime" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "overtimes", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);
    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdmin = ["superadmin", "admin"].includes(normalizedRole);

    if (!isAdmin) {
      return NextResponse.json({ message: "Anda tidak memiliki akses menghapus overtime" }, { status: 403 });
    }

    const item = await prisma.overtime.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: {
        id: true,
        tenantId: true,
        proofUrl: true,
        checkInFaceImage: true,
        checkOutFaceImage: true,
        attendance: { select: { checkInFaceImage: true, checkOutFaceImage: true } },
      },
    });
    if (!item) return NextResponse.json({ message: "Overtime not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await lockOvertimeJournal(tx, item.tenantId);
      await tx.journal.updateMany({
        where: { journalNo: `AUTO-OT-${item.id}` },
        data: { status: "VOID" },
      });
      await tx.overtime.delete({ where: { id: p.id } });
    });
    const evidenceUrls = [item.proofUrl, item.checkInFaceImage, item.checkOutFaceImage].filter(
      (value): value is string => Boolean(value) && value !== item.attendance?.checkInFaceImage && value !== item.attendance?.checkOutFaceImage,
    );
    await Promise.all(
      evidenceUrls.map(async (url) => {
        if (url.includes(BUCKET_AVATARS)) {
          const [overtimeReference, attendanceReference] = await Promise.all([
            prisma.overtime.findFirst({ where: { OR: [{ proofUrl: url }, { checkInFaceImage: url }, { checkOutFaceImage: url }] }, select: { id: true } }),
            prisma.attendance.findFirst({ where: { OR: [{ checkInFaceImage: url }, { checkOutFaceImage: url }] }, select: { id: true } }),
          ]);
          if (!overtimeReference && !attendanceReference) await deleteFromMinio(url);
        }
      }),
    );
    writeAuditLog({
      action: "overtimes.delete",
      status: "success",
      actorUserId: auth.user.id,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "overtime",
      targetId: p.id,
      message: "Overtime deleted",
    });
    return NextResponse.json({ message: "Overtime deleted" });
  } catch {
    return NextResponse.json({ message: "Failed to delete overtime" }, { status: 500 });
  }
}
