export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { canManageTaskDepartment } from "@/lib/auth/task-management";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";
import { encryptSecret } from "@/lib/security/secret-box";
import {
  buildPublicRequestToken,
  ensureRequestQueueList,
  generatePublicRequestKey,
} from "@/lib/helper/task-public-request";
import type { TaskPublicRequestSettingsDto } from "@/lib/dto/task-public-request";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authorize(departmentId: string, action: "get-all" | "update") {
  const auth = await requireSessionUser();
  if (auth.error) return { error: auth.error };
  const forbid = requirePermission(auth.user, "task-managements", action);
  if (forbid) return { error: forbid };

  if (!departmentId) {
    return { error: NextResponse.json({ message: "Department is required" }, { status: 400 }) };
  }
  if (!canManageTaskDepartment(auth.user, departmentId)) {
    return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }

  const scopedTenantId = ensureTenantScope(auth.user);
  const department = await prisma.department.findFirst({
    where: { id: departmentId, deletedAt: null, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    select: { id: true, tenantId: true, publicRequestKey: true },
  });
  if (!department) {
    return { error: NextResponse.json({ message: "Department not found" }, { status: 404 }) };
  }
  return { user: auth.user, department };
}

async function buildSettings(department: {
  id: string;
  tenantId: string | null;
  publicRequestKey: string | null;
}): Promise<TaskPublicRequestSettingsDto> {
  const mailConfig = department.tenantId
    ? await prisma.tenantMailConfig.findUnique({ where: { tenantId: department.tenantId } })
    : null;

  return {
    departmentId: department.id,
    enabled: Boolean(department.publicRequestKey),
    token: department.publicRequestKey
      ? buildPublicRequestToken(department.tenantId, department.id, department.publicRequestKey)
      : null,
    mailConfig: mailConfig
      ? {
          host: mailConfig.host,
          port: mailConfig.port,
          secure: mailConfig.secure,
          username: mailConfig.username,
          fromName: mailConfig.fromName,
          fromEmail: mailConfig.fromEmail,
          hasPassword: Boolean(mailConfig.passwordEncrypted),
        }
      : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const result = await authorize(req.nextUrl.searchParams.get("departmentId") || "", "get-all");
    if (result.error) return result.error;
    return NextResponse.json({ data: await buildSettings(result.department) });
  } catch (error) {
    console.error("GET TASK PUBLIC REQUEST ERROR:", error);
    return NextResponse.json({ message: "Failed to load public request settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await authorize(String(body.departmentId || ""), "update");
    if (result.error) return result.error;

    const department = await prisma.department.update({
      where: { id: result.department.id },
      data: { publicRequestKey: generatePublicRequestKey(), publicRequestUserId: result.user.id },
      select: { id: true, tenantId: true, publicRequestKey: true },
    });
    await ensureRequestQueueList(department.id, department.tenantId);

    writeAuditLog({
      action: "tasks.public_request_generate",
      status: "success",
      actorUserId: result.user.id,
      actorRole: result.user.roleName,
      tenantId: result.user.tenantId,
      targetType: "department",
      targetId: department.id,
      message: "Public request link generated",
    });

    return NextResponse.json({
      message: "Link publik berhasil dibuat",
      data: await buildSettings(department),
    });
  } catch (error) {
    console.error("GENERATE TASK PUBLIC REQUEST ERROR:", error);
    return NextResponse.json({ message: "Failed to generate public link" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const result = await authorize(req.nextUrl.searchParams.get("departmentId") || "", "update");
    if (result.error) return result.error;

    const department = await prisma.department.update({
      where: { id: result.department.id },
      data: { publicRequestKey: null },
      select: { id: true, tenantId: true, publicRequestKey: true },
    });

    return NextResponse.json({
      message: "Link publik dinonaktifkan",
      data: await buildSettings(department),
    });
  } catch (error) {
    console.error("DISABLE TASK PUBLIC REQUEST ERROR:", error);
    return NextResponse.json({ message: "Failed to disable public link" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await authorize(String(body.departmentId || ""), "update");
    if (result.error) return result.error;

    const tenantId = result.department.tenantId;
    if (!tenantId) {
      return NextResponse.json({ message: "Department belum terhubung ke perusahaan" }, { status: 400 });
    }

    const host = String(body.host || "").trim();
    const port = Number(body.port);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const fromEmail = String(body.fromEmail || "").trim();
    const fromName = String(body.fromName || "").trim() || null;
    const secure = Boolean(body.secure);

    if (!host || !username || !Number.isInteger(port) || port <= 0 || port > 65535) {
      return NextResponse.json({ message: "Host, port, dan username SMTP wajib valid" }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(fromEmail)) {
      return NextResponse.json({ message: "Email pengirim tidak valid" }, { status: 400 });
    }

    const existing = await prisma.tenantMailConfig.findUnique({ where: { tenantId } });
    if (!existing && !password) {
      return NextResponse.json({ message: "Password SMTP wajib diisi" }, { status: 400 });
    }

    const data = {
      host,
      port,
      secure,
      username,
      fromName,
      fromEmail,
      ...(password ? { passwordEncrypted: encryptSecret(password) } : {}),
    };
    await prisma.tenantMailConfig.upsert({
      where: { tenantId },
      update: data,
      create: { ...data, tenantId, passwordEncrypted: encryptSecret(password) },
    });

    writeAuditLog({
      action: "tenant.mail_config_update",
      status: "success",
      actorUserId: result.user.id,
      actorRole: result.user.roleName,
      tenantId,
      targetType: "tenant",
      targetId: tenantId,
      message: "Tenant mail config updated",
    });

    return NextResponse.json({
      message: "Pengaturan email berhasil disimpan",
      data: await buildSettings(result.department),
    });
  } catch (error) {
    console.error("UPDATE TENANT MAIL CONFIG ERROR:", error);
    return NextResponse.json({ message: "Failed to save mail settings" }, { status: 500 });
  }
}
