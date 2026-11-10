// app/api/change_password/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import prisma from "@/lib/prisma";
import { getExpiredAuthCookieOptions } from "@/lib/auth/cookie";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { writeAuditLog } from "@/lib/security/audit-log";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp } from "@/lib/security/request";

function getPasswordValidationMessage(password: string) {
  if (password.length < 8) {
    return "Password baru minimal 8 karakter.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password baru harus mengandung minimal 1 huruf besar.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password baru harus mengandung minimal 1 huruf kecil.";
  }
  if (!/\d/.test(password)) {
    return "Password baru harus mengandung minimal 1 angka.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password baru harus mengandung minimal 1 karakter khusus.";
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const rateLimit = await consumeRateLimit({
      key: `auth:change-password:${auth.user.id}:${getRequestIp(req)}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      writeAuditLog({
        action: "auth.change_password_failed",
        status: "denied",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        message: "Change password rate limit exceeded",
      });
      return NextResponse.json(
        { message: "Terlalu banyak percobaan ganti password. Coba lagi nanti." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      writeAuditLog({
        action: "auth.change_password_failed",
        status: "failed",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        message: "Current password or new password missing",
      });
      return NextResponse.json(
        { message: "Semua field wajib diisi." },
        { status: 400 },
      );
    }

    const passwordValidationMessage = getPasswordValidationMessage(newPassword);
    if (passwordValidationMessage) {
      writeAuditLog({
        action: "auth.change_password_failed",
        status: "failed",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        message: passwordValidationMessage,
      });
      return NextResponse.json(
        { message: passwordValidationMessage },
        { status: 400 },
      );
    }

    const scopedTenantId = ensureTenantScope(auth.user);

    const user = await prisma.user.findFirst({
      where: {
        id: auth.user.id,
        ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
      },
    });

    if (!user) {
      writeAuditLog({
        action: "auth.change_password_failed",
        status: "failed",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        message: "User not found during password change",
      });
      return NextResponse.json(
        { message: "User tidak ditemukan." },
        { status: 404 },
      );
    }

    // Verifikasi password saat ini menggunakan salt yang tersimpan
    const hashedCurrent = await bcrypt.hash(currentPassword, user.salt);
    if (hashedCurrent !== user.password) {
      writeAuditLog({
        action: "auth.change_password_failed",
        status: "failed",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        message: "Current password mismatch",
      });
      return NextResponse.json(
        { message: "Password saat ini tidak sesuai." },
        { status: 401 },
      );
    }

    // Cek password baru tidak sama dengan password lama
    const hashedNew = await bcrypt.hash(newPassword, user.salt);
    if (hashedNew === user.password) {
      writeAuditLog({
        action: "auth.change_password_failed",
        status: "failed",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        message: "New password equals old password",
      });
      return NextResponse.json(
        { message: "Password baru tidak boleh sama dengan password lama." },
        { status: 400 },
      );
    }

    // Generate salt baru & hash password baru
    const newSalt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(newPassword, newSalt);

    await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        password: newHashedPassword,
        salt: newSalt,
        currentToken: "",
      },
    });

    const response = NextResponse.json(
      { message: "The password has been successfully changed" },
      { status: 200 },
    );

    response.cookies.set("token", "", getExpiredAuthCookieOptions());

    response.cookies.set("remember_me", "", getExpiredAuthCookieOptions());

    writeAuditLog({
      action: "auth.change_password_success",
      status: "success",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      message: "Password changed successfully",
    });

    return response;
  } catch (error) {
    const auth = await requireSessionUser().catch(() => null);
    writeAuditLog({
      action: "auth.change_password_failed",
      status: "failed",
      request: req,
      actorUserId: auth && "user" in auth && !auth.error ? auth.user.id : null,
      actorRole: auth && "user" in auth && !auth.error ? auth.user.roleName : null,
      tenantId: auth && "user" in auth && !auth.error ? auth.user.tenantId : null,
      message: error instanceof Error ? error.message : "Unhandled change password error",
    });
    return NextResponse.json(
      { message: "An error occurred while changing the password" },
      { status: 500 },
    );
  }
}
