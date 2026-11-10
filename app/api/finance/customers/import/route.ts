export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSessionUser, tenantWhere } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp } from "@/lib/security/request";

export async function POST(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "finance", "import");
  if (forbid) return forbid;
  const rateLimit = await consumeRateLimit({
    key: `import:finance-customers:${auth.user.id}:${getRequestIp(req)}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    writeAuditLog({
      action: "finance.import_customers",
      status: "denied",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      message: "Customer import rate limit exceeded",
    });
    return NextResponse.json(
      { message: "Terlalu banyak request import. Coba lagi beberapa menit lagi." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const scope = tenantWhere(auth.user);

  if (!rows.length) {
    writeAuditLog({
      action: "finance.import_customers",
      status: "failed",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      message: "Customer import rows empty",
    });
    return NextResponse.json({ message: "Data import tidak ditemukan" }, { status: 400 });
  }

  const existing = await prisma.customer.findMany({
    where: scope,
    select: { code: true, email: true },
  });

  const seenCodes = new Set(existing.map((item) => item.code.toLowerCase()));
  const seenEmails = new Set(existing.map((item) => String(item.email || "").toLowerCase()).filter(Boolean));
  const errors: Array<{ row: number; column?: string; message: string }> = [];
  let created = 0;

  for (const item of rows) {
    const rowNumber = Number(item.rowNumber || 0);
    const payload = item.payload || {};
    const code = String(payload.code || "").trim();
    const name = String(payload.name || "").trim();
    const phone = String(payload.phone || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const address = String(payload.address || "").trim();

    if (seenCodes.has(code.toLowerCase())) {
      errors.push({ row: rowNumber, column: "Kode", message: "Kode sudah digunakan" });
      continue;
    }
    if (seenEmails.has(email)) {
      errors.push({ row: rowNumber, column: "Email", message: "Email sudah digunakan" });
      continue;
    }

    await prisma.customer.create({
      data: {
        code,
        name,
        phone: phone || null,
        email,
        address: address || null,
        tenantId: scope.tenantId ?? null,
      },
    });

    seenCodes.add(code.toLowerCase());
    seenEmails.add(email);
    created += 1;
  }

  writeAuditLog({
    action: "finance.import_customers",
    status: errors.length > 0 ? "failed" : "success",
    request: req,
    actorUserId: auth.user.id,
    actorName: auth.user.name,
    actorRole: auth.user.roleName,
    tenantId: auth.user.tenantId,
    message: "Customer import completed",
    metadata: {
      created,
      failed: errors.length,
      total: rows.length,
    },
  });

  return NextResponse.json({ data: { created, errors } });
}
