export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { TenantSubscriptionStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSessionUser, requireSuperAdmin } from "@/lib/auth/tenant";

const statuses = new Set(["PENDING", "ACTIVE", "EXPIRED", "CANCELLED"]);

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user);
  if (forbid) return forbid;
  const { id } = await params;
  const body = await req.json();
  const tenantId = String(body.tenantId || "");
  const planId = String(body.planId || "");
  const paymentMethodId = body.paymentMethodId ? String(body.paymentMethodId) : null;
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  const status = statuses.has(body.status) ? body.status as TenantSubscriptionStatus : "PENDING";
  if (!tenantId || !planId || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return NextResponse.json({ message: "Data subscription tidak valid" }, { status: 400 });
  const data = await prisma.$transaction(async (tx) => {
    if (status === "ACTIVE") await tx.tenantSubscription.updateMany({ where: { tenantId, status: "ACTIVE", id: { not: id } }, data: { status: "CANCELLED" } });
    const subscription = await tx.tenantSubscription.update({ where: { id }, data: { tenantId, planId, paymentMethodId, startDate, endDate, status }, include: { tenant: { select: { id: true, companyName: true } }, plan: { select: { id: true, name: true, type: true, price: true } }, paymentMethod: { select: { id: true, name: true, provider: true } } } });
    if (status === "ACTIVE") await tx.tenant.update({ where: { id: tenantId }, data: { subscriptionStart: startDate, subscriptionEnd: endDate } });
    return subscription;
  });
  return NextResponse.json({ message: "Subscription berhasil diperbarui", data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user);
  if (forbid) return forbid;
  const { id } = await params;
  await prisma.tenantSubscription.delete({ where: { id } });
  return NextResponse.json({ message: "Subscription berhasil dihapus" });
}
