export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { uploadBufferToMinio, BUCKET_AVATARS } from "@/lib/minio";
import { validateAttachmentBuffer } from "@/lib/security/file-validation";
import { randomUUID } from "crypto";
import { lockPettyCashJournal, syncPettyCashJournals } from "@/lib/helper/petty-cash-journal";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.pettyCash.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Petty Cash not found" },
        { status: 404 },
      );
    }

    const normalizedRole = auth.user.roleName.toLowerCase().replace(/\s/g, "");
    const isAdminRole =
      normalizedRole === "superadmin" || normalizedRole === "admin";

    if (!isAdminRole && existing.userId !== auth.user.id) {
      return NextResponse.json(
        { message: "Forbidden: You can only report usage for your own petty cash" },
        { status: 403 },
      );
    }

    const formData = await req.formData();
    const description = formData.get("description") as string;
    const amount = formData.get("amount") as string;
    const usageDate = formData.get("usageDate") as string;
    const transactionType = String(formData.get("transactionType") || "EXPENSE").toUpperCase();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    const legacyFile = formData.get("file");
    if (legacyFile instanceof File && legacyFile.size > 0) files.push(legacyFile);

    if (!description || !amount || !usageDate) {
      return NextResponse.json(
        { message: "Description, amount, and usage date are required" },
        { status: 400 },
      );
    }

    if (files.length > 5) {
      return NextResponse.json({ message: "Maksimal 5 bukti untuk setiap transaksi" }, { status: 400 });
    }

    const receiptUrls: string[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const validation = validateAttachmentBuffer(
        file.name || "",
        file.type || "application/octet-stream",
        buffer,
      );
      if (!validation.ok) {
        return NextResponse.json({ message: validation.message }, { status: 415 });
      }

      const fileName = await buildTenantStorageObjectName(
        scopedTenantId,
        "pettycash-receipts",
        `usage-${randomUUID()}-${file.name.replace(/\s+/g, "_")}`,
      );
      
      const receiptUrl = await uploadBufferToMinio(
        buffer,
        fileName,
        BUCKET_AVATARS,
        validation.contentType,
      );
      receiptUrls.push(receiptUrl);
    }
    if (!["EXPENSE", "TOP_UP", "RETURN"].includes(transactionType)) {
      return NextResponse.json({ message: "Jenis transaksi tidak valid" }, { status: 400 });
    }
    const transactionAmount = Number(amount);
    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
      return NextResponse.json({ message: "Nominal transaksi harus lebih dari nol" }, { status: 400 });
    }
    if (transactionType === "TOP_UP" && !isAdminRole) {
      return NextResponse.json({ message: "Tambahan dana hanya dapat dicatat oleh Finance/Admin" }, { status: 403 });
    }
    if (transactionType === "RETURN") {
      const transactions = await prisma.pettyCashUsage.findMany({
        where: { pettyCashId: existing.id },
        select: { amount: true, transactionType: true },
      });
      const currentBalance = existing.amount + transactions.reduce(
        (sum, transaction) => sum + (transaction.transactionType === "TOP_UP" ? transaction.amount : -transaction.amount),
        0,
      );
      if (transactionAmount > currentBalance) {
        return NextResponse.json({ message: "Nominal pengembalian melebihi sisa saldo" }, { status: 400 });
      }
    }

    const usage = await prisma.$transaction(async (tx) => {
      await lockPettyCashJournal(tx, existing.tenantId);
      const created = await tx.pettyCashUsage.create({
        data: {
          pettyCashId: p.id,
          description,
          amount: transactionAmount,
          usageDate: new Date(usageDate),
          receiptUrl: receiptUrls[0] ?? null,
          receiptUrls,
          transactionType,
        },
      });
      await syncPettyCashJournals(tx, existing, auth.user.id);
      return created;
    });

    return NextResponse.json(
      {
        message: "Usage reported successfully",
        data: {
          ...usage,
          receiptUrl: receiptUrls[0] ?? null,
          receiptUrls,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST petty cash usage error:", error);
    return NextResponse.json(
      { message: "Failed to report petty cash usage" },
      { status: 500 },
    );
  }
}
