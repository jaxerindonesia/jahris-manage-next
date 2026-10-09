export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSessionUser, requireSuperAdmin } from "@/lib/auth/tenant";

const asStringArray = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user);
  if (forbid) return forbid;
  const { id } = await params;
  const body = await req.json();
  const price = body.price === null || body.price === "" ? null : Number(body.price);
  if (!String(body.name || "").trim() || !String(body.description || "").trim() || (price !== null && (!Number.isInteger(price) || price < 0))) {
    return NextResponse.json({ message: "Data plan tidak valid" }, { status: 400 });
  }
  const data = await prisma.plan.update({ where: { id }, data: { name: String(body.name).trim(), description: String(body.description).trim(), type: body.type === "YEARLY" ? "YEARLY" : "MONTHLY", price, isActive: body.isActive !== false, featureDescription: asStringArray(body.featureDescription), featurePermission: asStringArray(body.featurePermission) } });
  return NextResponse.json({ message: "Plan berhasil diperbarui", data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user);
  if (forbid) return forbid;
  const { id } = await params;
  if (await prisma.tenantSubscription.count({ where: { planId: id } })) return NextResponse.json({ message: "Plan sudah digunakan dan tidak dapat dihapus. Nonaktifkan plan sebagai gantinya." }, { status: 409 });
  await prisma.plan.delete({ where: { id } });
  return NextResponse.json({ message: "Plan berhasil dihapus" });
}
