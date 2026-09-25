export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "departments", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const department = await prisma.department.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        tenant: { select: { id: true, companyName: true } },
      },
    });

    if (!department) {
      return NextResponse.json(
        { message: "Department not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(department);
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve department" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "departments", "update");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.department.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true, tenantId: true, branchId: true, name: true },
    });
    if (!existing) return NextResponse.json({ message: "Department not found" }, { status: 404 });

    const body = await req.json();
    const rawName = String(body.name || "").trim();
    const updateData: Prisma.DepartmentUncheckedUpdateInput = {};
    const hasBranchUpdate = Object.prototype.hasOwnProperty.call(body, "branchId");
    const branchId = hasBranchUpdate
      ? String(body.branchId || "").trim() || null
      : existing.branchId;

    if (hasBranchUpdate) {
      if (branchId) {
        const branch = await prisma.branch.findFirst({
          where: {
            id: branchId,
            ...(existing.tenantId ? { tenantId: existing.tenantId } : {}),
          },
          select: { id: true, isActive: true },
        });
        if (!branch) return NextResponse.json({ message: "Cabang tidak ditemukan" }, { status: 400 });
        if (!branch.isActive) return NextResponse.json({ message: "Cabang yang dipilih sedang nonaktif" }, { status: 400 });
      }
      updateData.branchId = branchId;
    }

    const finalName = rawName || existing.name;
    const duplicateDepartment = await prisma.department.findFirst({
      where: {
        ...(existing.tenantId ? { tenantId: existing.tenantId } : { tenantId: null }),
        branchId,
        name: { equals: finalName, mode: "insensitive" },
        NOT: { id: p.id },
      },
      select: { id: true },
    });
    if (duplicateDepartment) {
      return NextResponse.json(
        { message: "Nama departemen sudah digunakan pada cabang ini" },
        { status: 409 },
      );
    }
    if (rawName) updateData.name = rawName;

    const department = await prisma.department.update({
      where: { id: p.id },
      data: updateData,
    });

    return NextResponse.json({
      message: "Department successfully updated",
      data: department,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { message: "Nama departemen sudah digunakan pada cabang ini" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "Failed to update department" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "departments", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.department.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: "Department not found" }, { status: 404 });

    await prisma.department.delete({
      where: { id: p.id },
    });

    writeAuditLog({
      action: "departments.delete",
      status: "success",
      actorUserId: auth.user.id,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "department",
      targetId: p.id,
      message: "Department deleted",
    });

    return NextResponse.json({
      message: "Department successfully deleted",
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to delete department" },
      { status: 500 },
    );
  }
}
