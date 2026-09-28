export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { requireSessionUser, requireSuperAdmin } from "@/lib/auth/tenant";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;

    const forbid = requireSuperAdmin(auth.user);
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = (searchParams.get("search") || "").trim();
    const status = searchParams.get("status") || "";

    const where: Prisma.TenantWhereInput = {};

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { adminEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenant.count({ where }),
    ]);

    return NextResponse.json({
      message: "Tenants retrieved successfully",
      data: tenants,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("GET TENANTS ERROR:", error);
    return NextResponse.json(
      { message: "Failed to retrieve tenants" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;

    const forbid = requireSuperAdmin(auth.user);
    if (forbid) return forbid;

    const body = await req.json();
    const {
      companyName,
      adminEmail,
      logoUrl,
      logoDarkUrl,
      isActive = true,
      subscriptionStart,
      subscriptionEnd,
    } = body;
    const seedPassword = process.env.SEED_PASSWORD?.trim();

    if (!companyName || !adminEmail) {
      return NextResponse.json(
        { message: "Nama perusahaan dan email admin wajib diisi" },
        { status: 400 },
      );
    }

    if (!seedPassword) {
      return NextResponse.json(
        {
          message:
            "SEED_PASSWORD belum dikonfigurasi di server. Tenant tidak dapat dibuat dengan password kosong.",
        },
        { status: 500 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json(
        { message: "Email admin sudah digunakan user lain" },
        { status: 409 },
      );
    }

    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const adminRole =
      roles.find((r) => r.name.toLowerCase().trim() === "admin") ||
      roles.find((r) => r.name.toLowerCase().replace(/\s/g, "") !== "superadmin");

    if (!adminRole) {
      return NextResponse.json(
        { message: "Role untuk admin tenant belum tersedia" },
        { status: 400 },
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(seedPassword, salt);

    const { tenant, adminUser } = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          companyName,
          adminEmail,
          logoUrl: logoUrl ?? null,
          logoDarkUrl: logoDarkUrl ?? null,
          isActive: Boolean(isActive),
          subscriptionStart: subscriptionStart ? new Date(subscriptionStart) : null,
          subscriptionEnd: subscriptionEnd ? new Date(subscriptionEnd) : null,
        },
      });

      const createdAdmin = await tx.user.create({
        data: {
          email: adminEmail,
          name: `Admin ${companyName}`,
          joinDate: new Date(subscriptionStart),
          position: "Admin",
          roleId: adminRole.id,
          password: hashedPassword,
          salt,
          currentToken: "",
          status: "active",
          tenantId: createdTenant.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          roleId: true,
          tenantId: true,
        },
      });

      return { tenant: createdTenant, adminUser: createdAdmin };
    });

    return NextResponse.json(
      {
        message: "Tenant dan user admin berhasil dibuat",
        data: tenant,
        adminUser,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("CREATE TENANT ERROR:", error);
    return NextResponse.json(
      { message: "Failed to create tenant" },
      { status: 500 },
    );
  }
}
