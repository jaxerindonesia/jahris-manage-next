export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import prisma from "@/lib/prisma";
import { getAuthCookieOptions } from "@/lib/auth/cookie";
import { writeAuditLog } from "@/lib/security/audit-log";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp } from "@/lib/security/request";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, remember_me } = body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const rateLimit = await consumeRateLimit({
      key: `auth:login:${getRequestIp(req)}:${normalizedEmail || "unknown"}`,
      limit: 5,
      windowMs: 5 * 60 * 1000, // 5 menit
    });

    if (!rateLimit.allowed) {
      writeAuditLog({
        action: "auth.login_failed",
        status: "denied",
        request: req,
        message: "Login rate limit exceeded",
        metadata: {
          email: normalizedEmail || null,
        },
      });
      return NextResponse.json(
        {
          message: "Terlalu banyak percobaan login. Silakan coba lagi beberapa menit lagi.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    if (!email || !password) {
      writeAuditLog({
        action: "auth.login_failed",
        status: "failed",
        request: req,
        message: "Email or password missing",
        metadata: {
          email: normalizedEmail || null,
        },
      });
      return NextResponse.json(
        { message: "Email and password must be filled in" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            permission: true,
          },
        },
        tenant: true,
      },
    });

    if (!user) {
      writeAuditLog({
        action: "auth.login_failed",
        status: "failed",
        request: req,
        message: "Unknown email or invalid password",
        metadata: {
          email: normalizedEmail || null,
        },
      });
      return NextResponse.json(
        { message: "Email atau password salah" },
        { status: 401 },
      );
    }

    if (user.deletedAt) {
      writeAuditLog({
        action: "auth.login_failed",
        status: "denied",
        request: req,
        actorUserId: user.id,
        actorRole: user.role.name,
        tenantId: user.tenantId ?? null,
        message: "Deleted or inactive user attempted login",
      });
      return NextResponse.json(
        { message: "User is no longer active" },
        { status: 403 },
      );
    }

    if (user.tenantId && user.tenant) {
      if (!user.tenant.isActive) {
        writeAuditLog({
          action: "auth.login_failed",
          status: "denied",
          request: req,
          actorUserId: user.id,
          actorRole: user.role.name,
          tenantId: user.tenantId ?? null,
          message: "Inactive tenant login attempt",
        });
        return NextResponse.json(
          { message: "Tenant sedang nonaktif. Hubungi administrator." },
          { status: 403 },
        );
      }

      if (user.tenant.subscriptionEnd) {
        const endDate = new Date(user.tenant.subscriptionEnd);
        endDate.setHours(23, 59, 59, 999);
        if (Date.now() > endDate.getTime()) {
          writeAuditLog({
            action: "auth.login_failed",
            status: "denied",
            request: req,
            actorUserId: user.id,
            actorRole: user.role.name,
            tenantId: user.tenantId ?? null,
            message: "Expired tenant subscription login attempt",
          });
          return NextResponse.json(
            { message: "Masa langganan tenant sudah berakhir." },
            { status: 403 },
          );
        }
      }
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      writeAuditLog({
        action: "auth.login_failed",
        status: "failed",
        request: req,
        actorUserId: user.id,
        actorRole: user.role.name,
        tenantId: user.tenantId ?? null,
        message: "Invalid password",
        metadata: {
          email: normalizedEmail || null,
        },
      });
      return NextResponse.json(
        { message: "Email atau password salah" },
        { status: 401 },
      );
    }

    const expiresIn = remember_me ? "7d" : "1d";

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role.name,
      },
      process.env.JWT_SECRET!,
      {
        expiresIn,
      },
    );

    // simpan token ke DB
    await prisma.user.update({
      where: { id: user.id },
      data: {
        currentToken: token,
      },
    });

    const response = NextResponse.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name,
        permissions: user.role.permission,
        avatarUrl: user.avatarUrl ?? "",
        tenantId: user.tenantId ?? null,
        tenantName: user.tenant?.companyName ?? null,
        tenantLogoUrl: user.tenant?.logoUrl ?? null,
        departmentId: user.departmentId ?? null,
      },
    });

    // set cookie token (selalu)
    response.cookies.set(
      "token",
      token,
      getAuthCookieOptions(
        remember_me
          ? 60 * 60 * 24 * 7
          : 60 * 60 * 24,
      ),
    );

    // optional cookie remember_me
    if (remember_me) {
      response.cookies.set("remember_me", "true", getAuthCookieOptions(60 * 60 * 24 * 7));
    }

    writeAuditLog({
      action: "auth.login_success",
      status: "success",
      request: req,
      actorUserId: user.id,
      actorRole: user.role.name,
      tenantId: user.tenantId ?? null,
      message: "Login successful",
    });

    return response;
  } catch {
    writeAuditLog({
      action: "auth.login_failed",
      status: "failed",
      request: req,
      message: "Unhandled login error",
    });
    return NextResponse.json(
      { message: "Failed to login user" },
      { status: 500 },
    );
  }
}
