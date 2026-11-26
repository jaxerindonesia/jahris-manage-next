export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import prisma from "@/lib/prisma";
import { requireSessionUser, ensureTenantScope } from "@/lib/auth/tenant";
import { isSuperAdmin } from "@/lib/auth/session";
import type { EmployeeImportPayload } from "@/lib/helper/employee-import";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp } from "@/lib/security/request";
import { JOIN_DATE_ERROR_MESSAGE, parseJoinDate } from "@/lib/helper/join-date";

type ImportRequestRow = {
  rowNumber: number;
  payload: EmployeeImportPayload;
};

type ImportErrorItem = {
  row: number;
  column?: string;
  message: string;
};

function normalizeText(value: string | undefined | null) {
  return String(value ?? "").trim().toLowerCase();
}

function mapGender(gender?: string) {
  const raw = normalizeText(gender);
  if (!raw) return null;
  if (raw === "male" || raw === "laki-laki" || raw === "lakilaki") return "male";
  if (raw === "female" || raw === "perempuan") return "female";
  return null;
}

function mapStatus(status?: string) {
  const raw = normalizeText(status);
  if (!raw || raw === "active" || raw === "aktif") return "active";
  if (raw === "inactive" || raw === "tidak aktif") return "inactive";
  return "active";
}

function parseDate(dateValue?: string) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "users", "import");
    if (forbid) return forbid;
    const rateLimit = await consumeRateLimit({
      key: `import:users:${auth.user.id}:${getRequestIp(req)}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      writeAuditLog({
        action: "users.import",
        status: "denied",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        message: "User import rate limit exceeded",
      });
      return NextResponse.json(
        { message: "Terlalu banyak request import. Coba lagi beberapa menit lagi." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as ImportRequestRow[]) : [];
    const MAX_IMPORT_ROWS = 1000;

    if (rows.length === 0) {
      writeAuditLog({
        action: "users.import",
        status: "failed",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        message: "Import rows empty",
      });
      return NextResponse.json(
        { message: "Data import tidak ditemukan" },
        { status: 400 },
      );
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { message: `Maksimal ${MAX_IMPORT_ROWS} data per sekali import` },
        { status: 400 },
      );
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    const userIsSuperAdmin = isSuperAdmin(auth.user.roleName);

    const [roles, departments, tenants] = await Promise.all([
      prisma.role.findMany({
        where: scopedTenantId
          ? { OR: [{ tenantId: null }, { tenantId: scopedTenantId }] }
          : undefined,
        select: { id: true, name: true, tenantId: true },
      }),
      prisma.department.findMany({
        where: scopedTenantId ? { tenantId: scopedTenantId, deletedAt: null } : { deletedAt: null },
        select: { id: true, name: true, tenantId: true },
      }),
      userIsSuperAdmin
        ? prisma.tenant.findMany({
            select: { id: true, companyName: true },
          })
        : Promise.resolve([]),
    ]);

    const requestedEmails = rows
      .map((row) => normalizeText(row.payload?.email))
      .filter(Boolean);

    const existingUsers = requestedEmails.length
      ? await prisma.user.findMany({
          where: { email: { in: requestedEmails } },
          select: { email: true },
        })
      : [];

    const existingEmailSet = new Set(existingUsers.map((user) => normalizeText(user.email)));
    const batchEmailSet = new Set<string>();
    const tenantMap = new Map(tenants.map((tenant) => [normalizeText(tenant.companyName), tenant]));
    const errors: ImportErrorItem[] = [];
    const usersToCreate: Array<{
      tenantId: string | null;
      roleId: string;
      departmentId: string | null;
      email: string;
      name: string;
      password: string;
      salt: string;
      nik: string | null;
      phone: string | null;
      position: string | null;
      joinDate: Date | null;
      salary: number | null;
      salaryType: "daily" | "monthly";
      gender: string | null;
      address: string | null;
      birthDate: Date | null;
      birthPlace: string | null;
      currentToken: string;
      status: string;
    }> = [];

    for (let index = 0; index < rows.length; index += 1) {
      const item = rows[index];
      const row = item.payload;
      const rowNumber = item.rowNumber || index + 2;

      const email = normalizeText(row.email);
      const roleName = normalizeText(row.roleName);
      const tenantName = normalizeText(row.tenantName);
      const departmentName = normalizeText(row.departmentName);

      if (!row.name || !email || !row.password || !roleName) {
        if (!row.name) {
          errors.push({ row: rowNumber, column: "Nama Lengkap", message: "Nama Lengkap wajib diisi" });
        }
        if (!email) {
          errors.push({ row: rowNumber, column: "Email", message: "Email wajib diisi" });
        }
        if (!row.password) {
          errors.push({ row: rowNumber, column: "Password", message: "Password wajib diisi" });
        }
        if (!roleName) {
          errors.push({ row: rowNumber, column: "Role", message: "Role wajib diisi" });
        }
        continue;
      }

      if (row.password.length < 6) {
        errors.push({
          row: rowNumber,
          column: "Password",
          message: "Password minimal 6 karakter",
        });
        continue;
      }

      if (
        row.salaryType &&
        !["daily", "monthly"].includes(row.salaryType)
      ) {
        errors.push({
          row: rowNumber,
          column: "Jenis Pembayaran Gaji",
          message: "Jenis Pembayaran Gaji harus Harian atau Bulanan",
        });
        continue;
      }

      if (existingEmailSet.has(email) || batchEmailSet.has(email)) {
        errors.push({
          row: rowNumber,
          column: "Email",
          message: `Email ${row.email} sudah terdaftar`,
        });
        continue;
      }

      let finalTenantId = scopedTenantId;
      if (!finalTenantId) {
        const tenant = tenantMap.get(tenantName);
        if (!tenant) {
          errors.push({
            row: rowNumber,
            column: "Perusahaan",
            message: `Perusahaan ${row.tenantName || "-"} tidak ditemukan`,
          });
          continue;
        }
        finalTenantId = tenant.id;
      }

      const matchingRoles = roles.filter(
        (item) =>
          normalizeText(item.name) === roleName &&
          (item.tenantId === finalTenantId || item.tenantId === null),
      );
      const role = matchingRoles.find((item) => item.tenantId === finalTenantId)
        ?? matchingRoles.find((item) => item.tenantId === null);
      if (!role) {
        errors.push({
          row: rowNumber,
          column: "Role",
          message: `Role ${row.roleName} tidak ditemukan untuk tenant ini`,
        });
        continue;
      }
      if (isSuperAdmin(role.name) && !userIsSuperAdmin) {
        errors.push({
          row: rowNumber,
          column: "Role",
          message: "Hanya Super Admin yang dapat menetapkan role Super Admin",
        });
        continue;
      }

      let departmentId: string | null = null;
      if (departmentName) {
        const department = departments.find(
          (item) =>
            normalizeText(item.name) === departmentName &&
            (item.tenantId ?? null) === finalTenantId,
        );

        if (!department) {
          errors.push({
            row: rowNumber,
            column: "Departemen",
            message: `Departemen ${row.departmentName} tidak ditemukan`,
          });
          continue;
        }

        departmentId = department.id;
      }

      const joinDate = parseJoinDate(row.joinDate);
      if (joinDate === undefined) {
        errors.push({ row: rowNumber, column: "Tanggal Bergabung", message: JOIN_DATE_ERROR_MESSAGE });
        continue;
      }

      batchEmailSet.add(email);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(row.password, salt);

      usersToCreate.push({
        tenantId: finalTenantId,
        roleId: role.id,
        departmentId,
        email: row.email.trim(),
        name: row.name.trim(),
        password: hashedPassword,
        salt,
        nik: row.nik?.trim() || null,
        phone: row.phone?.trim() || null,
        position: row.position?.trim() || null,
        joinDate,
        salary: typeof row.salary === "number" ? row.salary : null,
        salaryType: row.salaryType || "monthly",
        gender: mapGender(row.gender),
        address: row.address?.trim() || null,
        birthDate: parseDate(row.birthDate),
        birthPlace: row.birthPlace?.trim() || null,
        currentToken: "",
        status: mapStatus(row.status),
      });
    }

    if (usersToCreate.length > 0) {
      await prisma.user.createMany({
        data: usersToCreate,
      });
    }

    const created = usersToCreate.length;

    writeAuditLog({
      action: "users.import",
      status: errors.length > 0 ? "failed" : "success",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      message: "User import completed",
      metadata: {
        total: rows.length,
        created,
        failed: errors.length,
      },
    });

    return NextResponse.json({
      message:
        errors.length > 0
          ? "Import selesai dengan beberapa catatan"
          : "Import data karyawan berhasil",
      data: {
        total: rows.length,
        created,
        failed: errors.length,
        errors,
      },
    });
  } catch (error) {
    const session = await requireSessionUser().catch(() => null);
    writeAuditLog({
      action: "users.import",
      status: "failed",
      request: req,
      actorUserId: session && "user" in session && !session.error ? session.user.id : null,
      actorRole: session && "user" in session && !session.error ? session.user.roleName : null,
      tenantId: session && "user" in session && !session.error ? session.user.tenantId : null,
      message: error instanceof Error ? error.message : "Unhandled user import error",
    });
    console.error("Error importing users:", error);
    return NextResponse.json(
      { message: "Gagal mengimpor data karyawan" },
      { status: 500 },
    );
  }
}
