export const runtime = "nodejs";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { deleteFromMinio } from "@/lib/minio";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";
import { validateUserAssignment } from "@/lib/helper/user-assignment-validation";
import { parseFaceDescriptor } from "@/lib/helper/face-descriptor";

// Helper: hapus file avatar lama dari MinIO
async function deleteOldAvatar(avatarUrl: string | null) {
  if (!avatarUrl) return;
  // Hanya hapus jika URL dari MinIO kita
  const minioBase = process.env.MINIO_PUBLIC_URL || "https://s3.jahris.id";
  if (!avatarUrl.startsWith(minioBase)) return;
  await deleteFromMinio(avatarUrl);
}

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, { params }: Params) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "users", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const { id } = await params;

    const user = await prisma.user.findFirst({
      where: { id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve user" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "users", "update");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const { id } = await params;
    const targetUser = await prisma.user.findFirst({
      where: { id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true, tenantId: true, roleId: true, departmentId: true, branchId: true },
    });
    if (!targetUser) return NextResponse.json({ message: "User not found" }, { status: 404 });

    const body = await req.json();

    if (
      body.salaryType !== undefined &&
      !["daily", "monthly"].includes(body.salaryType)
    ) {
      return NextResponse.json(
        { message: "Jenis pembayaran gaji tidak valid" },
        { status: 400 },
      );
    }

    const updateData: Prisma.UserUncheckedUpdateInput = {};

    const nextRoleId = body.roleId || targetUser.roleId;
    const nextDepartmentId = body.departmentId === undefined
      ? targetUser.departmentId
      : body.departmentId || null;
    const nextBranchId = body.branchId === undefined
      ? targetUser.branchId
      : body.branchId || null;
    const assignmentError = await validateUserAssignment({
      actorRoleName: auth.user.roleName,
      tenantId: targetUser.tenantId,
      roleId: nextRoleId,
      departmentId: nextDepartmentId,
      branchId: nextBranchId,
    });
    if (assignmentError) {
      return NextResponse.json({ message: assignmentError }, { status: 400 });
    }

    if (body.email) updateData.email = body.email;
    if (body.name) updateData.name = body.name;
    if (body.roleId) updateData.roleId = body.roleId;
    if (body.departmentId !== undefined) updateData.departmentId = body.departmentId || null;
    if (body.branchId !== undefined) {
      if (body.branchId) {
        if (!targetUser.tenantId) return NextResponse.json({ message: "User tidak memiliki tenant" }, { status: 400 });
        const branch = await prisma.branch.findFirst({
          where: { id: body.branchId, tenantId: targetUser.tenantId },
        });
        if (!branch) return NextResponse.json({ message: "Cabang tidak valid" }, { status: 400 });
      }
      updateData.branchId = body.branchId || null;
    }
    if (body.nik) updateData.nik = body.nik;
    if (body.phone) updateData.phone = body.phone;
    if (body.position) updateData.position = body.position;
    if (body.salary !== undefined) updateData.salary = body.salary;
    if (body.salaryType !== undefined) updateData.salaryType = body.salaryType;
    if (body.gender !== undefined) updateData.gender = body.gender || null;
    if (body.address !== undefined) updateData.address = body.address || null;
    if (body.birthPlace !== undefined) updateData.birthPlace = body.birthPlace || null;
    if (body.birthDate !== undefined) {
      updateData.birthDate = body.birthDate ? new Date(body.birthDate) : null;
    }
    if (body.status) updateData.status = body.status;

    if (body.faceDescriptor !== undefined) {
      if (body.faceDescriptor === null) {
        updateData.faceDescriptor = Prisma.JsonNull;
      } else {
        const parsedFaceDescriptor = parseFaceDescriptor(body.faceDescriptor);
        if (!parsedFaceDescriptor) {
          return NextResponse.json(
            { message: "Descriptor foto wajah tidak valid. Silakan ambil ulang foto." },
            { status: 400 },
          );
        }
        updateData.faceDescriptor = parsedFaceDescriptor;
      }
    }

    // Jika avatarUrl diupdate → hapus file lama dari disk terlebih dahulu
    if (body.avatarUrl !== undefined) {
      const newAvatarUrl = body.avatarUrl || null;
      updateData.avatarUrl = newAvatarUrl;
      if (!newAvatarUrl) updateData.faceDescriptor = Prisma.JsonNull;

      // Ambil avatarUrl lama dari DB
      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { avatarUrl: true },
      });

      const oldAvatarUrl = existingUser?.avatarUrl ?? null;

      // Hapus file lama jika berbeda dengan yang baru
      if (oldAvatarUrl && oldAvatarUrl !== newAvatarUrl) {
        await deleteOldAvatar(oldAvatarUrl);
      }
    }

    if (body.joinDate) {
      updateData.joinDate = new Date(body.joinDate);
    }

    if (body.password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(body.password, salt);

      updateData.password = hashedPassword;
      updateData.salt = salt;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      message: "User successfully updated",
      data: user,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to update user" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "users", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    // Ambil avatarUrl sebelum hapus user, untuk cleanup MinIO
    const user = await prisma.user.findFirst({
      where: { id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { avatarUrl: true },
    });
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    await prisma.user.delete({
      where: { id },
    });

    // Hapus foto wajah dari MinIO setelah user terhapus
    if (user?.avatarUrl) {
      await deleteOldAvatar(user.avatarUrl);
    }

    writeAuditLog({
      action: "users.delete",
      status: "success",
      actorUserId: auth.user.id,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "user",
      targetId: id,
      message: "User deleted",
    });

    return NextResponse.json({
      message: "User successfully deleted",
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to delete user" },
      { status: 500 },
    );
  }
}
