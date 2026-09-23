export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { lockPettyCashJournal, syncPettyCashJournals } from "@/lib/helper/petty-cash-journal";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "pettycash", "get-all");
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const status = searchParams.get("status") || "";

    const where: Prisma.PettyCashWhereInput = {};
    const scopedTenantId = ensureTenantScope(auth.user);
    if (scopedTenantId) where.tenantId = scopedTenantId;

    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdminRole = normalizedRole !== "karyawan";
    if (!isAdminRole) where.userId = auth.user.id;

    if (search) {
      where.OR = [
        { purpose: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (status) {
      where.status = status;
    }

    const [pettyCashes, total] = await Promise.all([
      prisma.pettyCash.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, position: true, department: true },
          },
          usages: {
            orderBy: { usageDate: "asc" },
          },
        },
      }),
      prisma.pettyCash.count({ where }),
    ]);

    return NextResponse.json({
      message: "Petty cash retrieved successfully",
      data: pettyCashes,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("GET petty cash error:", error);
    return NextResponse.json(
      { message: "Failed to retrieve petty cash data" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "pettycash", "create");
    if (forbid) return forbid;

    // Admin-only can create petty cash
    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdminRole = normalizedRole !== "karyawan";
    if (!isAdminRole) {
      return NextResponse.json(
        { message: "Forbidden: Only Admin can create petty cash" },
        { status: 403 },
      );
    }

    const body = await req.json();
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

    if (!userId || !purpose || !category || !amount || !bankName || !accountNumber) {
      return NextResponse.json(
        { message: "Required fields are missing" },
        { status: 400 },
      );
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    const targetUser = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
      },
      select: { id: true },
    });
    if (!targetUser) {
      return NextResponse.json(
        { message: "User target tidak ditemukan" },
        { status: 404 },
      );
    }

    const creatorUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { name: true },
    });
    const creatorName = creatorUser?.name || "Admin";

    const pettyCash = await prisma.$transaction(async (tx) => {
      await lockPettyCashJournal(tx, scopedTenantId);
      const created = await tx.pettyCash.create({
        data: {
          tenantId: scopedTenantId,
          userId,
          purpose,
          category,
          amount: Number(amount),
          transferDate: transferDate ? new Date(transferDate) : null,
          bankName,
          accountNumber,
          status: status || "PENDING",
          createdBy: creatorName,
        },
        include: {
          user: { select: { id: true, name: true, position: true, department: true } },
          usages: true,
        },
      });
      await syncPettyCashJournals(tx, created, auth.user.id);
      return created;
    });

    return NextResponse.json(
      {
        message: "Petty Cash created successfully",
        data: pettyCash,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST petty cash error:", error);
    return NextResponse.json(
      { message: "Failed to create petty cash" },
      { status: 500 },
    );
  }
}
