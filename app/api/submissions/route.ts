export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission, requirePermission } from "@/lib/auth/permission";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { syncSubmissionAttendanceForRange } from "@/lib/helper/submission-attendance";
import { uploadBufferToMinio, BUCKET_AVATARS } from "@/lib/minio";
import { validateAttachmentBuffer } from "@/lib/security/file-validation";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "submissions", "get-all");
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const submissionTypeId = searchParams.get("submissionTypeId") || "";
    const activeEmployeesOnly = searchParams.get("activeEmployeesOnly") === "true";

    const where: Prisma.SubmissionWhereInput = {};
    const scopedTenantId = ensureTenantScope(auth.user);
    if (scopedTenantId) where.tenantId = scopedTenantId;

    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdminRole =
      normalizedRole === "superadmin" || normalizedRole === "admin";
    if (!isAdminRole) {
      where.OR = [
        { userId: auth.user.id },
        { approvalDecisions: { some: { approverUserId: auth.user.id } } },
      ];
    }

    if (activeEmployeesOnly) where.user = { status: "active" };

    if (search) {
      where.user = {
        ...(activeEmployeesOnly ? { status: "active" } : {}),
        name: { contains: search, mode: "insensitive" },
      };
    }

    if (status) where.status = status;
    if (submissionTypeId) where.submissionTypeId = submissionTypeId;

    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true } },
          submissionType: {
            select: { id: true, name: true },
          },
          approvalDecisions: {
            select: { approverUserId: true, approverUser: { select: { name: true } }, status: true, reason: true, decidedAt: true },
          },
        },
      }),
      prisma.submission.count({ where }),
    ]);

    return NextResponse.json({ message: "Submissions retrieved successfully", data: submissions, total, page, limit });
  } catch {
    return NextResponse.json({ message: "Failed to retrieve submissions data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "submissions", "create");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);
    const canManageSubmissions = hasPermission(auth.user, "submissions", "update");
    const formData = await req.formData();
    const userId = String(formData.get("userId") || "");
    const submissionTypeId = String(formData.get("submissionTypeId") || "");
    const startDate = String(formData.get("startDate") || "");
    const endDate = String(formData.get("endDate") || "");
    const reason = String(formData.get("reason") || "");
    const status = String(formData.get("status") || "PENDING");
    const file = formData.get("file") as File | null;
    const tenantIdFromForm = String(formData.get("tenantId") || "");
    const finalTenantId = scopedTenantId ?? (tenantIdFromForm || null);

    if (!userId || !status || !submissionTypeId || !startDate || !endDate || !reason) {
      return NextResponse.json({ message: "All submission fields are required fields" }, { status: 400 });
    }
    if (!canManageSubmissions && userId !== auth.user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const targetUserId = canManageSubmissions ? userId : auth.user.id;
    const targetUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        deletedAt: null,
        ...(finalTenantId ? { tenantId: finalTenantId } : {}),
      },
      select: { id: true },
    });
    if (!targetUser) {
      return NextResponse.json({ message: "User target tidak ditemukan" }, { status: 404 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ message: "Format tanggal tidak valid" }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json(
        { message: "Tanggal selesai tidak boleh sebelum tanggal mulai" },
        { status: 400 },
      );
    }

    const submissionType = await prisma.submissionType.findFirst({
      where: { id: submissionTypeId, ...(finalTenantId ? { tenantId: finalTenantId } : {}) },
      include: {
        leaveConfig: { include: { submissionTypes: { select: { id: true } } } },
        approverConfigs: { select: { approverUserId: true } },
      },
    });

    if (submissionType?.leaveConfig) {
      const config = submissionType.leaveConfig;
      const requestedDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const linkedTypeIds = config.submissionTypes.map((t: { id: string }) => t.id);
      const yearStart = new Date(start.getFullYear(), 0, 1);
      const yearEnd = new Date(start.getFullYear(), 11, 31, 23, 59, 59);
      const approvedSubmissions = await prisma.submission.findMany({
        where: {
          ...(finalTenantId ? { tenantId: finalTenantId } : {}),
          userId: targetUserId,
          submissionTypeId: { in: linkedTypeIds },
          status: "APPROVED",
          startDate: { gte: yearStart, lte: yearEnd },
        },
        select: { startDate: true, endDate: true },
      });
      const usedDays = approvedSubmissions.reduce((total: number, sub: { startDate: Date; endDate: Date }) => total + (Math.ceil((new Date(sub.endDate).getTime() - new Date(sub.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1), 0);
      const remainingDays = config.maxDays - usedDays;
      if (requestedDays > remainingDays) {
        return NextResponse.json({ message: remainingDays <= 0 ? `Kuota cuti "${config.name}" sudah habis. Sisa: 0 hari dari ${config.maxDays} hari.` : `Permintaan melebihi batas cuti "${config.name}". Sisa kuota: ${remainingDays} hari, Anda mengajukan ${requestedDays} hari.` }, { status: 422 });
      }
    }

    const existing = await prisma.submission.findFirst({
      where: { ...(finalTenantId ? { tenantId: finalTenantId } : {}), userId: targetUserId, submissionTypeId, startDate: new Date(startDate), endDate: new Date(endDate) },
    });
    if (existing) return NextResponse.json({ message: "Submission already exists for this user" }, { status: 409 });

    const approverUserIds = submissionType?.approverConfigs.map((a) => a.approverUserId) ?? [];

    const submission = await prisma.submission.create({
      data: {
        tenantId: finalTenantId,
        userId: targetUserId,
        submissionTypeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        status,
        approvalDecisions: approverUserIds.length
          ? { createMany: { data: approverUserIds.map((approverUserId) => ({ approverUserId, status: "PENDING" })) } }
          : undefined,
      },
    });

    let proofUrl: string | null = null;

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const validation = validateAttachmentBuffer(
        file.name || "",
        file.type || "application/octet-stream",
        buffer,
      );
      if (!validation.ok) {
        return NextResponse.json({ message: validation.message }, { status: 415 });
      }

      const fileName = await buildTenantStorageObjectName(
        finalTenantId,
        "submissions",
        `proof-${submission.id}-${Date.now()}-${file.name.replace(/\s+/g, "_")}`,
      );

      proofUrl = await uploadBufferToMinio(
        buffer,
        fileName,
        BUCKET_AVATARS,
        validation.contentType,
      );

      await prisma.submission.update({
        where: { id: submission.id },
        data: { proofUrl },
      });
    }

    if (submission.status === "APPROVED") {
      await syncSubmissionAttendanceForRange({
        userId: submission.userId,
        tenantId: submission.tenantId,
        startDate: submission.startDate,
        endDate: submission.endDate,
      });
    }

    return NextResponse.json({
      message: "Submission successfully created.",
      data: {
        ...submission,
        proofUrl,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("POST SUBMISSION ERROR:", error);
    return NextResponse.json({ message: "Failed to create submission" }, { status: 500 });
  }
}
