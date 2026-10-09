export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma, TenantSubscriptionStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSessionUser, requireSuperAdmin } from "@/lib/auth/tenant";

const statuses = new Set(["PENDING", "ACTIVE", "EXPIRED", "CANCELLED"]);

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user);
  if (forbid) return forbid;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.max(1, Number(searchParams.get("limit") || 10));
  const search = searchParams.get("search")?.trim() || "";
  const status = searchParams.get("status") || "";
  const where: Prisma.TenantSubscriptionWhereInput = {
    ...(search ? { OR: [{ tenant: { companyName: { contains: search, mode: "insensitive" } } }, { plan: { name: { contains: search, mode: "insensitive" } } }] } : {}),
    ...(statuses.has(status) ? { status: status as TenantSubscriptionStatus } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.tenantSubscription.findMany({ where, include: { tenant: { select: { id: true, companyName: true } }, plan: { select: { id: true, name: true, type: true, price: true } }, paymentMethod: { select: { id: true, name: true, provider: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.tenantSubscription.count({ where }),
  ]);
  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user);
  if (forbid) return forbid;
  const body = await req.json();
  const tenantId = String(body.tenantId || "");
  const planId = String(body.planId || "");
  const paymentMethodId = body.paymentMethodId ? String(body.paymentMethodId) : null;
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  const status = statuses.has(body.status) ? body.status as TenantSubscriptionStatus : "PENDING";
  if (!tenantId || !planId || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return NextResponse.json({ message: "Tenant, plan, dan periode subscription tidak valid" }, { status: 400 });

  const data = await prisma.$transaction(async (tx) => {
    if (status === "ACTIVE") await tx.tenantSubscription.updateMany({ where: { tenantId, status: "ACTIVE" }, data: { status: "CANCELLED" } });
    const subscription = await tx.tenantSubscription.create({ data: { tenantId, planId, paymentMethodId, startDate, endDate, status }, include: { tenant: { select: { id: true, companyName: true } }, plan: { select: { id: true, name: true, type: true, price: true } }, paymentMethod: { select: { id: true, name: true, provider: true } } } });
    if (status === "ACTIVE") await tx.tenant.update({ where: { id: tenantId }, data: { subscriptionStart: startDate, subscriptionEnd: endDate } });
    return subscription;
  });
  return NextResponse.json({ message: "Subscription berhasil dibuat", data }, { status: 201 });
}
