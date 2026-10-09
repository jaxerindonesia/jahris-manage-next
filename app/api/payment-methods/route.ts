export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSessionUser, requireSuperAdmin } from "@/lib/auth/tenant";
import { paymentData, validatePaymentData } from "@/lib/helper/payment-method";

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(); if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user); if (forbid) return forbid;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1)); const limit = Math.max(1, Number(searchParams.get("limit") || 10)); const search = searchParams.get("search")?.trim() || "";
  const where: Prisma.PaymentMethodWhereInput = search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { provider: { contains: search, mode: "insensitive" } }] } : {};
  const [data, total] = await Promise.all([prisma.paymentMethod.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], skip: (page - 1) * limit, take: limit }), prisma.paymentMethod.count({ where })]);
  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionUser(); if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user); if (forbid) return forbid;
  const data = paymentData(await req.json()); const error = validatePaymentData(data);
  if (error) return NextResponse.json({ message: error }, { status: 400 });
  const created = await prisma.paymentMethod.create({ data });
  return NextResponse.json({ message: "Metode pembayaran berhasil dibuat", data: created }, { status: 201 });
}
