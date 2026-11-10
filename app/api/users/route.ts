export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import prisma from "@/lib/prisma";
import { requireSessionUser, ensureTenantScope } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { validateUserAssignment } from "@/lib/helper/user-assignment-validation";
import { parseFaceDescriptor } from "@/lib/helper/face-descriptor";
import { JOIN_DATE_ERROR_MESSAGE, parseJoinDate } from "@/lib/helper/join-date";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "users", "get-all");
    if (forbid) return forbid;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const departmentId = searchParams.get("departmentId") || "";
    const branchId = searchParams.get("branchId") || "";
    const position = searchParams.get("position") || "";
    const tenantId = searchParams.get("tenantId") || "";

    const where: Prisma.UserWhereInput = {};
    const scopedTenantId = ensureTenantScope(auth.user);
    if (scopedTenantId) where.tenantId = scopedTenantId;
    if (!scopedTenantId && tenantId) where.tenantId = tenantId;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { nik: { contains: search, mode: "insensitive" } },
        { position: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (branchId) {
      where.branchId = branchId;
    }

    if (position) {
      where.position = position;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ status: "asc" }, { name: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          tenantId: true,
          roleId: true,
          departmentId: true,
          branchId: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          nik: true,
          phone: true,
          position: true,
          joinDate: true,
          salary: true,
          salaryType: true,
          gender: true,
          address: true,
          birthDate: true,
          birthPlace: true,
          avatarUrl: true,
          faceDescriptor: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          branch: { select: { id: true, name: true } },
          role: {
            select: {
              id: true,
              name: true,
            },
          },
          tenant: {
            select: {
              id: true,
              companyName: true,
              logoUrl: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      message: "Users retrieved successfully",
      data: users,
      total,
      page,
      limit,
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve user data" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "users", "create");
    if (forbid) return forbid;

    const body = await req.json();

    const {
      email,
      name,
      password,
      roleId,
      departmentId,
      branchId,
      nik,
      phone,
      position,
      joinDate,
      salary,
      salaryType,
      gender,
      address,
      birthDate,
      birthPlace,
      avatarUrl,
      faceDescriptor,
      tenantId,
    } = body;

    if (!email || !name || !password || !roleId) {
      return NextResponse.json(
        { message: "Email, name, password, and role are required fields" },
        { status: 400 },
      );
    }

    if (
      salaryType !== undefined &&
      !["daily", "monthly"].includes(salaryType)
    ) {
      return NextResponse.json(
        { message: "Jenis pembayaran gaji tidak valid" },
        { status: 400 },
      );
    }

    const parsedJoinDate = parseJoinDate(joinDate);
    if (parsedJoinDate === undefined) {
      return NextResponse.json({ message: JOIN_DATE_ERROR_MESSAGE }, { status: 400 });
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    const finalTenantId = scopedTenantId ?? tenantId ?? null;

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: finalTenantId } });
      if (!branch) return NextResponse.json({ message: "Cabang tidak valid" }, { status: 400 });
    }

    const assignmentError = await validateUserAssignment({
      actorRoleName: auth.user.roleName,
      tenantId: finalTenantId,
      roleId,
      departmentId: departmentId || null,
      branchId: branchId || null,
    });
    if (assignmentError) {
      return NextResponse.json({ message: assignmentError }, { status: 400 });
    }

    if (existing) {
      return NextResponse.json(
        { message: "Email already registered" },
        { status: 409 },
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const parsedFaceDescriptor = parseFaceDescriptor(faceDescriptor);
    if (avatarUrl && !parsedFaceDescriptor) {
      return NextResponse.json(
        { message: "Descriptor foto wajah tidak valid. Silakan ambil ulang foto." },
        { status: 400 },
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        salt,
        roleId,
        departmentId,
        branchId: branchId || null,
        nik,
        phone,
        position,
        joinDate: parsedJoinDate,
        salary,
        salaryType: salaryType || "monthly",
        gender: gender || null,
        address: address || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        birthPlace: birthPlace || null,
        avatarUrl: avatarUrl || null,
        faceDescriptor: parsedFaceDescriptor ?? undefined,
        currentToken: "",
        tenantId: finalTenantId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "User successfully created.",
        data: user,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { message: "Failed to create user" },
      { status: 500 },
    );
  }
}
