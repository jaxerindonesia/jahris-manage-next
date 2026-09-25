import { cookies, headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import { writeAuditLog } from "@/lib/security/audit-log";
import { parseFaceDescriptor } from "@/lib/helper/face-descriptor";

type JwtPayload = {
  sub?: string;
  role?: string;
};

type SessionFailureReason =
  | "missing_token"
  | "missing_jwt_secret"
  | "invalid_jwt"
  | "missing_subject"
  | "user_not_found"
  | "user_deleted"
  | "missing_tenant"
  | "token_mismatch"
  | "tenant_inactive"
  | "tenant_subscription_expired"
  | "internal_error";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  roleName: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantLogoUrl: string | null;
  departmentId: string | null;
  avatarUrl: string;
  faceDescriptor: number[] | null;
  permissions: Array<{
    model: string;
    action: string;
  }>;
};

export type SessionValidationResult =
  | {
      ok: true;
      user: SessionUser;
      token: string;
    }
  | {
      ok: false;
      reason: SessionFailureReason;
      tokenPresent: boolean;
      detail?: string;
      userId?: string | null;
    };

export async function getSessionUser(): Promise<SessionValidationResult> {
  let token = "";
  let decodedUserId: string | null = null;

  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const authHeader = headerStore.get("authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    token = cookieStore.get("token")?.value || bearerToken;
    if (!token) {
      return {
        ok: false,
        reason: "missing_token",
        tokenPresent: false,
      };
    }
    if (!process.env.JWT_SECRET) {
      writeAuditLog({
        action: "auth.login_failed",
        status: "failed",
        message: "JWT_SECRET is missing during session validation",
      });
      return {
        ok: false,
        reason: "missing_jwt_secret",
        tokenPresent: true,
      };
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    if (!decoded?.sub) {
      return {
        ok: false,
        reason: "missing_subject",
        tokenPresent: true,
      };
    }

    decodedUserId = decoded.sub;

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: {
        role: { select: { name: true, permission: true } },
        tenant: {
          select: {
            isActive: true,
            subscriptionEnd: true,
            companyName: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!user) {
      return {
        ok: false,
        reason: "user_not_found",
        tokenPresent: true,
        userId: decoded.sub,
      };
    }
    if (user.deletedAt) {
      return {
        ok: false,
        reason: "user_deleted",
        tokenPresent: true,
        userId: user.id,
      };
    }
    if (!isSuperAdmin(user.role.name) && !user.tenantId) {
      return {
        ok: false,
        reason: "missing_tenant",
        tokenPresent: true,
        userId: user.id,
      };
    }
    if (!user.currentToken || user.currentToken !== token) {
      return {
        ok: false,
        reason: "token_mismatch",
        tokenPresent: true,
        userId: user.id,
      };
    }

    if (user.tenantId && user.tenant) {
      if (!user.tenant.isActive) {
        return {
          ok: false,
          reason: "tenant_inactive",
          tokenPresent: true,
          userId: user.id,
        };
      }

      if (user.tenant.subscriptionEnd) {
        const endDate = new Date(user.tenant.subscriptionEnd);
        endDate.setHours(23, 59, 59, 999);
        if (Date.now() > endDate.getTime()) {
          return {
            ok: false,
            reason: "tenant_subscription_expired",
            tokenPresent: true,
            userId: user.id,
          };
        }
      }
    }

    return {
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleName: user.role.name,
        tenantId: user.tenantId ?? null,
        tenantName: user.tenant?.companyName ?? null,
        tenantLogoUrl: user.tenant?.logoUrl ?? null,
        departmentId: user.departmentId ?? null,
        avatarUrl: user.avatarUrl ?? "",
        faceDescriptor: parseFaceDescriptor(user.faceDescriptor),
        permissions: Array.isArray(user.role.permission)
          ? (user.role.permission as Array<{ model: string; action: string }>)
          : [],
      },
    };
  } catch (error) {
    // Next.js uses framework-owned exceptions to opt routes into dynamic
    // rendering. They must not be converted into authentication failures.
    unstable_rethrow(error);

    const detail = error instanceof Error ? error.message : "Unknown session error";
    const isJwtError =
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError ||
      error instanceof jwt.NotBeforeError;

    if (isJwtError) {
      return {
        ok: false,
        reason: "invalid_jwt",
        tokenPresent: Boolean(token),
        detail,
        userId: decodedUserId,
      };
    }

    writeAuditLog({
      action: "auth.login_failed",
      status: "failed",
      actorUserId: decodedUserId,
      message: "Session validation internal error",
      metadata: {
        detail,
      },
    });

    return {
      ok: false,
      reason: "internal_error",
      tokenPresent: Boolean(token),
      detail,
      userId: decodedUserId,
    };
  }
}

export function isSuperAdmin(roleName: string) {
  return roleName.toLowerCase().replace(/\s/g, "") === "superadmin";
}
