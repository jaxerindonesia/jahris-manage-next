export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";

export async function GET() {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "tenants", "get-by-id");
    if (forbid) return forbid;

    const tenantId = ensureTenantScope(auth.user);
    if (!tenantId) {
      return NextResponse.json({ message: "Tenant tidak ditemukan" }, { status: 404 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        companyName: true,
        logoUrl: true,
        logoDarkUrl: true,
      },
    });

    return NextResponse.json({ message: "OK", data: tenant ?? null });
  } catch (error) {
    console.error("GET TENANT CONFIG ERROR:", error);
    return NextResponse.json(
      { message: "Gagal mengambil konfigurasi tenant" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "tenants", "update");
    if (forbid) return forbid;

    const tenantId = ensureTenantScope(auth.user);
    if (!tenantId) {
      return NextResponse.json({ message: "Tenant tidak ditemukan" }, { status: 404 });
    }

    const body = await req.json();
    const { companyName, logoUrl, logoDarkUrl } = body;

    const data: {
      companyName?: string;
      logoUrl?: string | null;
      logoDarkUrl?: string | null;
    } = {};

    if (companyName !== undefined && companyName !== null) {
      data.companyName = String(companyName).trim();
    }
    if (logoUrl !== undefined) data.logoUrl = logoUrl;
    if (logoDarkUrl !== undefined) data.logoDarkUrl = logoDarkUrl;

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: {
        id: true,
        companyName: true,
        logoUrl: true,
        logoDarkUrl: true,
      },
    });

    writeAuditLog({
      action: "tenants.update",
      status: "success",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "tenant",
      targetId: updated.id,
      message: "Tenant configuration updated",
      metadata: {
        companyNameChanged: companyName !== undefined,
        logoUrlChanged: logoUrl !== undefined,
        logoDarkUrlChanged: logoDarkUrl !== undefined,
      },
    });

    return NextResponse.json({
      message: "Konfigurasi tenant berhasil disimpan",
      data: updated,
    });
  } catch (error) {
    console.error("PUT TENANT CONFIG ERROR:", error);
    return NextResponse.json(
      { message: "Gagal menyimpan konfigurasi tenant" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "tenants", "update");
    if (forbid) return forbid;

    const tenantId = ensureTenantScope(auth.user);
    if (!tenantId) {
      return NextResponse.json({ message: "Tenant tidak ditemukan" }, { status: 404 });
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl: null, logoDarkUrl: null },
    });

    writeAuditLog({
      action: "tenants.reset_logo",
      status: "success",
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "tenant",
      targetId: updated.id,
      message: "Tenant logos reset",
    });

    return NextResponse.json({
      message: "Logo tenant berhasil direset ke logo default",
    });
  } catch (error) {
    console.error("DELETE TENANT CONFIG ERROR:", error);
    return NextResponse.json(
      { message: "Gagal mereset konfigurasi tenant" },
      { status: 500 },
    );
  }
}
