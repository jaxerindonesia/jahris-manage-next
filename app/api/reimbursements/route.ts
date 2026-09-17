export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { hasPermission, requirePermission } from "@/lib/auth/permission";
import { randomUUID } from "node:crypto";
import { cleanupReimbursementReceipts, prepareReimbursementDetails, ReimbursementInputError } from "@/lib/helper/reimbursement-details";

function buildReimbursementReferenceNumber(id: string, createdAt: Date) {
  return `RBM-${createdAt.getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "reimbursements", "get-all");
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const status = searchParams.get("status") || "";

    const where: Prisma.ReimbursementWhereInput = {};
    const scopedTenantId = ensureTenantScope(auth.user);
    if (scopedTenantId) where.tenantId = scopedTenantId;

    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdminRole = normalizedRole !== "karyawan";
    if (!isAdminRole) where.userId = auth.user.id;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { referenceNumber: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (category) {
      where.AND = [{ OR: [{ details: { some: { category } } }, { details: { none: {} }, category }] }];
    }

    if (status) {
      where.status = { equals: status, mode: "insensitive" };
    }

    const [reimbursements, total] = await Promise.all([
      prisma.reimbursement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          details: { orderBy: { position: "asc" } },
          user: {
            select: { id: true, name: true, position: true, department: true },
          },
        },
      }),
      prisma.reimbursement.count({ where }),
    ]);

    return NextResponse.json({
      message: "Reimbursements retrieved successfully",
      data: reimbursements,
      total,
      page,
      limit,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve reimbursements data" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const uploadedUrls: string[] = [];
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "reimbursements", "create");
    if (forbid) return forbid;
    const form = await req.formData();
    const userId = String(form.get("userId") || "");
    const title = String(form.get("title") || "").trim();
    if (!userId || !title) throw new ReimbursementInputError("Karyawan dan judul klaim wajib diisi");
    const scopedTenantId = ensureTenantScope(auth.user);
    const canManage = hasPermission(auth.user, "reimbursements", "update");
    if (!canManage && userId !== auth.user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    const targetUser = await prisma.user.findFirst({
      where: { id: canManage ? userId : auth.user.id, deletedAt: null,
        ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true, tenantId: true },
    });
    if (!targetUser) return NextResponse.json({ message: "User target tidak ditemukan" }, { status: 404 });
    const tenantId = scopedTenantId ?? targetUser.tenantId;
    const { details, ...summary } = await prepareReimbursementDetails(form, tenantId, uploadedUrls);
    const id = randomUUID();
    const reimbursement = await prisma.reimbursement.create({
      data: {
        id, tenantId, userId: targetUser.id, title, ...summary,
        referenceNumber: buildReimbursementReferenceNumber(id, new Date()),
        bankName: String(form.get("bankName") || "").trim() || null,
        accountNumber: String(form.get("accountNumber") || "").trim() || null,
        description: String(form.get("description") || "").trim() || null,
        status: "PENDING", details: { create: details },
      },
      include: { details: { orderBy: { position: "asc" } } },
    });
    return NextResponse.json({ message: "Reimbursement berhasil dibuat", data: reimbursement }, { status: 201 });
  } catch (error) {
    await cleanupReimbursementReceipts(uploadedUrls);
    if (error instanceof ReimbursementInputError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: "Failed to create reimbursement" }, { status: 500 });
  }
}
