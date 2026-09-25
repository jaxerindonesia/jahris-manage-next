import { NextResponse } from "next/server";
import {
  getSessionUser,
  isSuperAdmin,
  type SessionUser,
} from "@/lib/auth/session";

export async function requireSessionUser() {
  const session = await getSessionUser();

  if (!session.ok) {
    if (session.reason === "internal_error") {
      return {
        error: NextResponse.json(
          {
            message: "Internal Server Error",
            code: "SESSION_VALIDATION_ERROR",
            detail: session.detail,
          },
          { status: 500 },
        ),
        user: null,
      } as const;
    }

    return {
      error: NextResponse.json(
        {
          message: "Unauthorized",
          code: session.reason,
        },
        { status: 401 },
      ),
      user: null,
    } as const;
  }

  return { error: null, user: session.user } as const;
}

export function requireSuperAdmin(user: SessionUser) {
  if (!isSuperAdmin(user.roleName)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return null;
}

export function ensureTenantScope(user: SessionUser) {
  if (isSuperAdmin(user.roleName)) return null;
  if (!user.tenantId) throw new Error("Tenant-scoped user is missing tenantId");
  return user.tenantId;
}

export function tenantWhere(user: SessionUser) {
  if (isSuperAdmin(user.roleName)) return {};
  if (!user.tenantId) {
    throw new Error("Tenant-scoped user is missing tenantId");
  }

  return { tenantId: user.tenantId };
}
