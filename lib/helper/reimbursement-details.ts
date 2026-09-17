import { randomUUID } from "node:crypto";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { BUCKET_AVATARS, deleteFromMinio, uploadBufferToMinio } from "@/lib/minio";
import { validateAttachmentBuffer } from "@/lib/security/file-validation";
import { REIMBURSEMENT_CATEGORIES, getReceiptUrls } from "@/lib/helper/reimbursement";

export class ReimbursementInputError extends Error {}

type ExistingDetail = { id?: string; receiptUrl: string | null; receiptUrls?: string[] };
type DetailInput = { id?: string; category: string; amount: number; date: Date; receiptUrl: string | null; receiptUrls: string[]; position: number };

export async function prepareReimbursementDetails(
  form: FormData, tenantId: string | null, uploadedUrls: string[], existing: ExistingDetail[] = [],
) {
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("details"))); }
  catch { throw new ReimbursementInputError("Rincian pengeluaran tidak valid"); }
  if (!Array.isArray(raw) || !raw.length || raw.length > 50) {
    throw new ReimbursementInputError("Isi antara 1 sampai 50 rincian pengeluaran");
  }
  const seenIds = new Set<string>();
  const details: DetailInput[] = raw.map((row: unknown, position: number) => {
    if (!row || typeof row !== "object") throw new ReimbursementInputError("Rincian pengeluaran tidak valid");
    const item = row as Record<string, unknown>;
    const category = typeof item.category === "string" ? item.category.trim() : "";
    const amount = item.amount;
    const dateText = typeof item.date === "string" ? item.date : "";
    const date = new Date(`${dateText}T00:00:00.000Z`);
    if (!REIMBURSEMENT_CATEGORIES.includes(category)) {
      throw new ReimbursementInputError(`Pilih kategori pada rincian ${position + 1}`);
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > Number.MAX_SAFE_INTEGER / 100) {
      throw new ReimbursementInputError(`Nominal rincian ${position + 1} harus lebih dari nol dan tidak terlalu besar`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) {
      throw new ReimbursementInputError(`Tanggal rincian ${position + 1} tidak valid`);
    }
    const id = typeof item.id === "string" ? item.id : undefined;
    if (id && (seenIds.has(id) || !existing.some((detail) => detail.id === id))) {
      throw new ReimbursementInputError("Rincian bukan milik klaim ini atau terduplikasi");
    }
    if (id) seenIds.add(id);
    const receiptUrls: unknown = item.receiptUrls ?? (item.receiptUrl ? [item.receiptUrl] : []);
    if (!Array.isArray(receiptUrls) || receiptUrls.some((url) => typeof url !== "string" || !url)) {
      throw new ReimbursementInputError("Daftar bukti pembayaran tidak valid");
    }
    const stored = existing.find((detail) => detail.id === id);
    const allowedUrls = stored ? getReceiptUrls(stored) : [];
    if (receiptUrls.some((url) => !allowedUrls.includes(url))) {
      throw new ReimbursementInputError("Bukti pembayaran tidak sesuai dengan rincian klaim");
    }
    const urls = [...new Set(receiptUrls)] as string[];
    return { category, amount, date, receiptUrl: urls[0] ?? null, receiptUrls: urls, position };
  });
  const amount = Math.round(details.reduce((sum, detail) => sum + detail.amount, 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount > Number.MAX_SAFE_INTEGER / 100) {
    throw new ReimbursementInputError("Total pengeluaran terlalu besar");
  }

  // Validate every attachment before uploading or writing the claim.
  const attachments: { position: number; file: File; buffer: Buffer; contentType: string }[] = [];
  for (const detail of details) {
    for (const file of form.getAll(`receipt-${detail.position}`)) {
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) {
      throw new ReimbursementInputError(`Bukti rincian ${detail.position + 1} harus berukuran 1 byte sampai 5 MB`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateAttachmentBuffer(file.name, file.type, buffer);
    if (!validation.ok) throw new ReimbursementInputError(validation.message);
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(validation.contentType)) {
      throw new ReimbursementInputError("Bukti harus berupa JPG, PNG, WebP, atau PDF");
    }
    attachments.push({ position: detail.position, file, buffer, contentType: validation.contentType });
    }
  }
  for (const attachment of attachments) {
    const objectName = await buildTenantStorageObjectName(tenantId, "reimbursements", `receipt-${randomUUID()}-${attachment.file.name}`);
    const url = await uploadBufferToMinio(attachment.buffer, objectName, BUCKET_AVATARS, attachment.contentType);
    uploadedUrls.push(url);
    details[attachment.position].receiptUrls.push(url);
    details[attachment.position].receiptUrl = details[attachment.position].receiptUrls[0];
  }
  return {
    details,
    amount,
    category: [...new Set(details.map((detail) => detail.category))].join(", "),
    date: new Date(Math.min(...details.map((detail) => detail.date.getTime()))),
    receiptUrl: details.find((detail) => detail.receiptUrl)?.receiptUrl ?? null,
  };
}

export async function cleanupReimbursementReceipts(urls: (string | null | undefined)[]) {
  await Promise.all([...new Set(urls.filter((url): url is string => !!url))].map((url) => deleteFromMinio(url)));
}
