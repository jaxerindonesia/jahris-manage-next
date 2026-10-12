export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSessionUser, requireSuperAdmin } from "@/lib/auth/tenant";
import { paymentData, validatePaymentData } from "@/lib/helper/payment-method";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser(); if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user); if (forbid) return forbid;
  const { id } = await params; const data = paymentData(await req.json()); const error = validatePaymentData(data);
  if (error) return NextResponse.json({ message: error }, { status: 400 });
  const updated = await prisma.paymentMethod.update({ where: { id }, data });
  return NextResponse.json({ message: "Metode pembayaran berhasil diperbarui", data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser(); if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user); if (forbid) return forbid;
  const { id } = await params;
  if (await prisma.tenantSubscription.count({ where: { paymentMethodId: id } })) return NextResponse.json({ message: "Metode pembayaran sudah digunakan. Nonaktifkan sebagai gantinya." }, { status: 409 });
  await prisma.paymentMethod.delete({ where: { id } });
  return NextResponse.json({ message: "Metode pembayaran berhasil dihapus" });
}
