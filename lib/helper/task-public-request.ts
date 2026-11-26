import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-box";

export const REQUEST_QUEUE_LIST_NAME = "Antrian Request";
export const PUBLIC_REQUEST_SOURCE = "PUBLIC_FORM";
export const PUBLIC_REQUEST_MAX_FILES = 5;
export const PUBLIC_REQUEST_OTHER_DIVISION = "Lainnya";

export const PUBLIC_REQUEST_MAX_TYPES = 20;
export const PUBLIC_REQUEST_TYPE_MAX_LENGTH = 80;

export const IT_REQUEST_TYPES = [
  "Hardware (PC, laptop, printer)",
  "Software / Instalasi aplikasi",
  "Jaringan / Internet",
  "Akun & Akses (email, sistem)",
  "Pengembangan / Perubahan Sistem",
  "Data / Laporan",
  "Lainnya",
] as const;

export const GENERAL_REQUEST_TYPES = [
  "Permintaan Baru",
  "Perbaikan / Kendala",
  "Dokumen / Administrasi",
  "Data / Laporan",
  "Informasi / Pertanyaan",
  "Lainnya",
] as const;

type RequestTypeDepartment = { name: string; code: string | null };

function isItDepartment(department: RequestTypeDepartment) {
  return [department.name, department.code ?? ""].some((value) => /^\s*it\b/i.test(value));
}

export function defaultRequestTypes(department: RequestTypeDepartment): string[] {
  return [...(isItDepartment(department) ? IT_REQUEST_TYPES : GENERAL_REQUEST_TYPES)];
}

/** Jenis request untuk form: daftar custom department, atau default bila kosong. */
export function resolveRequestTypes(
  department: RequestTypeDepartment & { publicRequestTypes: string[] },
): string[] {
  return department.publicRequestTypes.length > 0
    ? department.publicRequestTypes
    : defaultRequestTypes(department);
}

/** Rapikan input admin: trim, buang kosong & duplikat. Null bila melebihi batas. */
export function normalizeRequestTypes(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") return null;
    const value = item.trim();
    if (!value) continue;
    if (value.length > PUBLIC_REQUEST_TYPE_MAX_LENGTH) return null;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.length > PUBLIC_REQUEST_MAX_TYPES ? null : result;
}

export const PUBLIC_REQUEST_PRIORITIES = [
  { value: "LOW", label: "Rendah", hint: "bisa menunggu" },
  { value: "MEDIUM", label: "Sedang", hint: "mengganggu pekerjaan" },
  { value: "HIGH", label: "Tinggi", hint: "pekerjaan terhenti" },
  { value: "URGENT", label: "Urgent", hint: "berdampak ke banyak orang / klien" },
] as const;

type PublicRequestTokenPayload = { t: string | null; d: string; k: string };

export function generatePublicRequestKey() {
  return randomBytes(16).toString("hex");
}

export function buildPublicRequestToken(tenantId: string | null, departmentId: string, key: string) {
  const payload: PublicRequestTokenPayload = { t: tenantId, d: departmentId, k: key };
  return encryptSecret(JSON.stringify(payload));
}

export async function resolvePublicRequestToken(token: string) {
  const decrypted = decryptSecret(token);
  if (!decrypted) return null;

  let payload: PublicRequestTokenPayload;
  try {
    payload = JSON.parse(decrypted);
  } catch {
    return null;
  }
  if (!payload?.d || !payload.k) return null;

  const department = await prisma.department.findFirst({
    where: {
      id: payload.d,
      tenantId: payload.t,
      deletedAt: null,
      publicRequestKey: payload.k,
    },
    select: {
      id: true,
      name: true,
      code: true,
      tenantId: true,
      publicRequestUserId: true,
      publicRequestTypes: true,
      tenant: { select: { companyName: true, logoUrl: true, isActive: true } },
    },
  });

  if (!department || department.tenant?.isActive === false) return null;
  return department;
}

async function ensureBoardId(departmentId: string, tenantId: string | null) {
  const board = await prisma.taskBoard.findFirst({
    where: { departmentId, ...(tenantId ? { tenantId } : {}) },
    select: { id: true },
  });
  if (board) return board.id;

  const created = await prisma.taskBoard.create({
    data: { departmentId, tenantId, name: "Task Board" },
    select: { id: true },
  });
  return created.id;
}

export async function ensureRequestQueueList(departmentId: string, tenantId: string | null) {
  const boardId = await ensureBoardId(departmentId, tenantId);
  const lists = await prisma.taskList.findMany({
    where: { boardId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });

  const existing = lists.find(
    (list) => list.name.toLowerCase() === REQUEST_QUEUE_LIST_NAME.toLowerCase(),
  );
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    await Promise.all(
      lists.map((list, index) =>
        tx.taskList.update({ where: { id: list.id }, data: { position: index + 1 } }),
      ),
    );
    return tx.taskList.create({
      data: { name: REQUEST_QUEUE_LIST_NAME, position: 0, boardId },
      select: { id: true, name: true },
    });
  });
}
