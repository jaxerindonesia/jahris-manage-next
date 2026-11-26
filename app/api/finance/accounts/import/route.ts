export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
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
    key: `import:finance-accounts:${auth.user.id}:${getRequestIp(req)}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    writeAuditLog({
      action: "finance.import_accounts",
      status: "denied",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      message: "Account import rate limit exceeded",
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
  const tenantId = ensureTenantScope(auth.user) ?? null;

  if (!rows.length) {
    writeAuditLog({
      action: "finance.import_accounts",
      status: "failed",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      message: "Account import rows empty",
    });
    return NextResponse.json({ message: "Data import tidak ditemukan" }, { status: 400 });
  }

  const [categories, accounts] = await Promise.all([
    prisma.accountCategory.findMany({
      where: tenantId ? { tenantId } : {},
      select: { id: true, code: true },
    }),
    prisma.account.findMany({
      where: tenantId ? { tenantId } : {},
      select: { id: true, code: true },
    }),
  ]);

  const categoryMap = new Map(categories.map((item) => [item.code.toLowerCase(), item.id]));
  const accountMap = new Map(accounts.map((item) => [item.code.toLowerCase(), item.id]));
  const seenCodes = new Set(accounts.map((item) => item.code.toLowerCase()));

  const errors: Array<{ row: number; column?: string; message: string }> = [];
  let created = 0;

  for (const item of rows) {
    const rowNumber = Number(item.rowNumber || 0);
    const payload = item.payload || {};
    const code = String(payload.code || "").trim();
    const name = String(payload.name || "").trim();
    const accountCategoryCode = String(payload.accountCategoryCode || "").trim().toLowerCase();
    const normalBalance = String(payload.normalBalance || "").trim().toUpperCase();
    const parentCode = String(payload.parentCode || "").trim().toLowerCase();
    const isActive = String(payload.isActive || "").trim().toUpperCase();

    if (seenCodes.has(code.toLowerCase())) {
      errors.push({ row: rowNumber, column: "Kode", message: "Kode akun sudah digunakan" });
      continue;
    }

    const accountCategoryId = categoryMap.get(accountCategoryCode);
    if (!accountCategoryId) {
      errors.push({ row: rowNumber, column: "Kode Kategori Akun", message: "Kategori akun tidak ditemukan" });
      continue;
    }

    const parentId = parentCode ? accountMap.get(parentCode) : null;
    if (parentCode && !parentId) {
      errors.push({ row: rowNumber, column: "Kode Parent", message: "Akun parent tidak ditemukan" });
      continue;
    }

    const createdAccount = await prisma.account.create({
      data: {
        code,
        name,
        accountCategoryId,
        parentId: parentId ?? null,
        normalBalance: normalBalance === "CREDIT" ? "CREDIT" : "DEBIT",
        isActive: !isActive || isActive === "AKTIF" || isActive === "ACTIVE",
        tenantId,
      },
      select: { id: true },
    });

    seenCodes.add(code.toLowerCase());
    accountMap.set(code.toLowerCase(), createdAccount.id);
    created += 1;
  }

  writeAuditLog({
    action: "finance.import_accounts",
    status: errors.length > 0 ? "failed" : "success",
    request: req,
    actorUserId: auth.user.id,
    actorName: auth.user.name,
    actorRole: auth.user.roleName,
    tenantId: auth.user.tenantId,
    message: "Account import completed",
    metadata: {
      created,
      failed: errors.length,
      total: rows.length,
    },
  });

  return NextResponse.json({ data: { created, errors } });
}
