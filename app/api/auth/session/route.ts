export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/tenant";

export async function GET() {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;

  return NextResponse.json({
    message: "OK",
    data: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.roleName,
      roleName: auth.user.roleName,
      tenantId: auth.user.tenantId,
      tenantName: auth.user.tenantName,
      tenantLogoUrl: auth.user.tenantLogoUrl,
      departmentId: auth.user.departmentId,
      avatarUrl: auth.user.avatarUrl,
      permissions: auth.user.permissions,
    },
  });
}
