import { NextResponse } from "next/server";
import { isSuperAdmin, type SessionUser } from "@/lib/auth/session";
import { hasPlanPermission } from "@/lib/auth/feature-access";

export function hasPermission(
  user: SessionUser,
  model: string,
  action: string,
) {
  if (isSuperAdmin(user.roleName)) return true;
  if (!hasPlanPermission(user.featurePermissions, model, action)) return false;

  return user.permissions.some(
    (permission) =>
      permission.model === model && permission.action === action,
  );
}

export function requirePermission(
  user: SessionUser,
  model: string,
  action: string,
) {
  if (hasPermission(user, model, action)) {
    return null;
  }

  return NextResponse.json({ message: "Forbidden" }, { status: 403 });
}
