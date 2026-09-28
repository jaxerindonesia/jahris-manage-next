export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";

type Params = {
  params: { id: string };
};

export async function GET(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "roles", "get-by-id");
    if (forbid) return forbid;

    const role = await prisma.role.findFirst({
      where: { id: p.id },
      select: {
        id: true,
        name: true,
        permission: true,
      },
    });

    if (!role) {
      return NextResponse.json(
        { message: "Role not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(role);
  } catch (error) {
    console.error("GET ROLE ERROR:", error);

    return NextResponse.json(
      { message: "Failed to retrieve role" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "roles", "update");
    if (forbid) return forbid;

    const existing = await prisma.role.findFirst({
      where: { id: p.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: "Role not found" }, { status: 404 });

    const body = await req.json();
    const { name, permissions } = body;

    const role = await prisma.role.update({
      where: { id: p.id },
      data: {
        name,
        permission: permissions,
      },
      select: {
        id: true,
        name: true,
        permission: true,
      },
    });

    return NextResponse.json({
      message: "Role successfully updated",
      data: role,
    });
  } catch (error) {
    console.error("UPDATE ROLE ERROR:", error);

    return NextResponse.json(
      { message: "Failed to update role" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "roles", "delete");
    if (forbid) return forbid;

    const existing = await prisma.role.findFirst({
      where: { id: p.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: "Role not found" }, { status: 404 });

    await prisma.role.delete({
      where: { id: p.id },
    });

    writeAuditLog({
      action: "roles.delete",
      status: "success",
      actorUserId: auth.user.id,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "role",
      targetId: p.id,
      message: "Role deleted",
    });

    return NextResponse.json({
      message: "Role successfully deleted",
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to delete role" },
      { status: 500 }
    );
  }
}
