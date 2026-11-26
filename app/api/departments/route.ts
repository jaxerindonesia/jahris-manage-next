export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { normalizeDepartmentCode } from "@/lib/helper/task-ticket";

export async function GET() {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "departments", "get-all");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const departments = await prisma.department.findMany({
      where: scopedTenantId ? { tenantId: scopedTenantId } : {},
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        code: true,
        tenantId: true,
        branchId: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        tenant: {
          select: {
            id: true,
            companyName: true,
          },
        },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({
      message: "Departments retrieved successfully",
      data: departments,
    });
  } catch (error) {
    console.error("GET DEPARTMENTS ERROR:", error);

    return NextResponse.json(
      { message: "Failed to retrieve departments data" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "departments", "create");
    if (forbid) return forbid;

    const body = await req.json();

    const rawName = String(body.name || "").trim();

    if (!rawName) {
      return NextResponse.json(
        { message: "Department name is required" },
        { status: 400 },
      );
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    const branchId = String(body.branchId || "").trim() || null;
    const selectedBranch = branchId
      ? await prisma.branch.findFirst({
          where: { id: branchId, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
          select: { id: true, tenantId: true, isActive: true },
        })
      : null;
    if (branchId && !selectedBranch) {
      return NextResponse.json({ message: "Cabang tidak ditemukan" }, { status: 400 });
    }
    if (selectedBranch && !selectedBranch.isActive) {
      return NextResponse.json({ message: "Cabang yang dipilih sedang nonaktif" }, { status: 400 });
    }
    const finalTenantId = scopedTenantId ?? body.tenantId ?? selectedBranch?.tenantId ?? null;
    if (selectedBranch && selectedBranch.tenantId !== finalTenantId) {
      return NextResponse.json({ message: "Cabang tidak sesuai dengan tenant departemen" }, { status: 400 });
    }
    const existingDepartment = await prisma.department.findFirst({
      where: {
        ...(finalTenantId ? { tenantId: finalTenantId } : { tenantId: null }),
        branchId,
        name: { equals: rawName, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existingDepartment) {
      return NextResponse.json(
        { message: "Nama departemen sudah digunakan pada cabang ini" },
        { status: 409 },
      );
    }

    const department = await prisma.department.create({
      data: { name: rawName, code: normalizeDepartmentCode(body.code), tenantId: finalTenantId, branchId },
    });

    return NextResponse.json(
      {
        message: "Department successfully created.",
        data: department,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("CREATE DEPARTMENT ERROR:", error);
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { message: "Nama departemen sudah digunakan pada cabang ini" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "Failed to create department" },
      { status: 500 },
    );
  }
}
