export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSessionUser, requireSuperAdmin } from "@/lib/auth/tenant";

const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user);
  if (forbid) return forbid;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.max(1, Number(searchParams.get("limit") || 10));
  const search = searchParams.get("search")?.trim() || "";
  const active = searchParams.get("active");
  const where: Prisma.PlanWhereInput = {
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    ...(active === "true" || active === "false" ? { isActive: active === "true" } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.plan.findMany({ where, orderBy: [{ name: "asc" }, { type: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.plan.count({ where }),
  ]);
  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;
  const forbid = requireSuperAdmin(auth.user);
  if (forbid) return forbid;

  const body = await req.json();
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const type = body.type === "YEARLY" ? "YEARLY" : "MONTHLY";
  const price = body.price === null || body.price === "" ? null : Number(body.price);
  if (!name || !description || (price !== null && (!Number.isInteger(price) || price < 0))) {
    return NextResponse.json({ message: "Nama, deskripsi, dan harga paket tidak valid" }, { status: 400 });
  }
  const data = await prisma.plan.create({ data: { name, description, type, price, isActive: body.isActive !== false, featureDescription: asStringArray(body.featureDescription), featurePermission: asStringArray(body.featurePermission) } });
  return NextResponse.json({ message: "Plan berhasil dibuat", data }, { status: 201 });
}
