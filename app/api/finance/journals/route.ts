export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { REIMBURSEMENT_JOURNAL_PREFIX } from "@/lib/helper/reimbursement-journal";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";

function calcTotals(details: Array<{ debit?: number; credit?: number }>) {
  return details.reduce<{ debit: number; credit: number }>(
    (acc, item) => ({
      debit: acc.debit + Number(item.debit || 0),
      credit: acc.credit + Number(item.credit || 0),
    }),
    { debit: 0, credit: 0 },
  );
}

async function generateJournalNo(dateInput?: string | null) {
  const baseDate = dateInput ? new Date(dateInput) : new Date();
  const year = Number.isNaN(baseDate.getTime()) ? new Date().getFullYear() : baseDate.getFullYear();
  const prefix = `JRNL-${year}-`;
  const latestJournal = await prisma.journal.findFirst({
    where: {
      journalNo: {
        startsWith: prefix,
      },
    },
    orderBy: {
      journalNo: "desc",
    },
    select: {
      journalNo: true,
    },
  });

  const latestSequence = latestJournal?.journalNo.match(new RegExp(`^JRNL-${year}-(\\d{4})$`));
  const nextNumber = (latestSequence ? Number(latestSequence[1]) : 0) + 1;

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "finance", "get-all");
  if (forbid) return forbid;
  const scopedTenantId = ensureTenantScope(auth.user);

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") || "list";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10));
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";

  if (scope === "generate-no") {
    const journalNo = await generateJournalNo(searchParams.get("date"));
    return NextResponse.json({ journalNo });
  }

  const where: Prisma.JournalWhereInput = scopedTenantId
    ? { creator: { tenantId: scopedTenantId } }
    : {};

  if (search) {
    where.OR = [
      { journalNo: { contains: search, mode: "insensitive" } },
      { referenceNo: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status && status !== "all") {
    const normalizedStatus = status.toUpperCase();
    if (
      normalizedStatus === "DRAFT" ||
      normalizedStatus === "POSTED" ||
      normalizedStatus === "VOID"
    ) {
      where.status = normalizedStatus;
    }
  }

  const [data, total] = await Promise.all([
    prisma.journal.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        details: { include: { account: true, customer: true, vendor: true } },
        creator: true,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.journal.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requirePermission(auth.user, "finance", "create");
  if (forbid) return forbid;
  const body = await req.json();
  const journalNo = String(body.journalNo || "").trim();
  if (journalNo.startsWith(REIMBURSEMENT_JOURNAL_PREFIX)) {
    return NextResponse.json({ message: "Nomor ini khusus jurnal otomatis reimbursement." }, { status: 400 });
  }
  const details = Array.isArray(body.details) ? body.details : [];
  const totals = calcTotals(details);

  if (!journalNo) {
    return NextResponse.json({ message: "No jurnal wajib diisi." }, { status: 400 });
  }

  const duplicate = await prisma.journal.findUnique({ where: { journalNo } });
  if (duplicate) {
    return NextResponse.json({ message: "No jurnal sudah digunakan." }, { status: 409 });
  }

  if (totals.debit !== totals.credit) {
    return NextResponse.json({ message: "Total debit dan credit harus sama." }, { status: 400 });
  }
  const data = await prisma.journal.create({
    data: {
      journalNo,
      date: new Date(body.date),
      referenceNo: body.referenceNo || null,
      description: body.description || null,
      createdBy: auth.user.id,
      status: body.status || "DRAFT",
      details: {
        create: details.map((item: { accountId: string; debit?: number; credit?: number; description?: string; customerId?: string; vendorId?: string }) => ({
          accountId: item.accountId,
          debit: Number(item.debit || 0),
          credit: Number(item.credit || 0),
          description: item.description || null,
          customerId: item.customerId || null,
          vendorId: item.vendorId || null,
        })),
      },
    },
    include: { details: true },
  });
  writeAuditLog({
    action: "finance.journals.create",
    status: "success",
    actorUserId: auth.user.id,
    actorRole: auth.user.roleName,
    tenantId: auth.user.tenantId,
    targetType: "journal",
    targetId: data.id,
    message: "Journal created",
    metadata: {
      journalNo: data.journalNo,
      status: body.status || "DRAFT",
      detailCount: details.length,
    },
  });
  return NextResponse.json({ data }, { status: 201 });
}
