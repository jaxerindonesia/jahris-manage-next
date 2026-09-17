import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/auth/session";
import { requireSessionUser } from "@/lib/auth/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { message: "Seed endpoint is disabled in production" },
        { status: 403 },
      );
    }

    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    if (!isSuperAdmin(auth.user.roleName)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // ===============================
    // ROLE PERMISSIONS
    // ===============================

    const roles = [
      {
        name: "Super Admin",
        permission: [
          { model: "users", action: "get-all" },
          { model: "users", action: "get-by-id" },
          { model: "users", action: "create" },
          { model: "users", action: "update" },

          { model: "roles", action: "get-all" },
          { model: "roles", action: "get-by-id" },
          { model: "roles", action: "create" },
          { model: "roles", action: "update" },

          { model: "submissions", action: "get-all" },
          { model: "submissions", action: "get-by-id" },
          { model: "submissions", action: "create" },
          { model: "submissions", action: "update" },

          { model: "submission_types", action: "get-all" },
          { model: "submission_types", action: "get-by-id" },
          { model: "submission_types", action: "create" },
          { model: "submission_types", action: "update" },

          { model: "attendances", action: "get-all" },
          { model: "attendances", action: "get-by-id" },
          { model: "attendances", action: "create" },
          { model: "attendances", action: "update" },

          { model: "payrolls", action: "get-all" },
          { model: "payrolls", action: "get-by-id" },
          { model: "payrolls", action: "create" },
          { model: "payrolls", action: "update" },

          { model: "reimbursements", action: "get-all" },
          { model: "reimbursements", action: "get-by-id" },
          { model: "reimbursements", action: "create" },
          { model: "reimbursements", action: "update" },
          { model: "reimbursements", action: "delete" },

          { model: "performances", action: "get-all" },
          { model: "performances", action: "get-by-id" },
          { model: "performances", action: "create" },
          { model: "performances", action: "update" },

          { model: "tenants", action: "get-all" },
          { model: "tenants", action: "get-by-id" },
          { model: "tenants", action: "create" },
          { model: "tenants", action: "update" },
          { model: "tenants", action: "delete" },
        ],
      },
      {
        name: "Karyawan",
        permission: [
          { model: "dashboard", action: "view" },

          { model: "leaves", action: "get-all" },
          { model: "leaves", action: "get-by-id" },
          { model: "leaves", action: "create" },

          { model: "attendances", action: "get-all" },
          { model: "attendances", action: "create" },
          { model: "attendances", action: "update" },
        ],
      },
    ];

    const createdRoles = [];

    for (const roleData of roles) {
      const existingRole = await prisma.role.findFirst({
        where: { name: roleData.name },
      });

      let role;

      if (!existingRole) {
        role = await prisma.role.create({
          data: roleData,
        });
      } else {
        role = await prisma.role.update({
          where: { id: existingRole.id },
          data: {
            permission: roleData.permission,
          },
        });
      }

      createdRoles.push(role);
    }

    // ===============================
    // DEPARTMENTS
    // ===============================

    const departmentNames = ["Management", "IT"];

    const createdDepartments = [];

    for (const name of departmentNames) {
      let department = await prisma.department.findFirst({
        where: { name },
      });

      if (!department) {
        department = await prisma.department.create({
          data: { name },
        });
      }

      createdDepartments.push(department);
    }

    const managementDept = createdDepartments.find(
      (d) => d.name === "Management",
    );

    const itDept = createdDepartments.find((d) => d.name === "IT");

    // ===============================
    // USERS
    // ===============================

    const adminRole = createdRoles.find((r) => r.name === "Super Admin");
    const employeeRole = createdRoles.find((r) => r.name === "Karyawan");

    if (!adminRole || !employeeRole) {
      return NextResponse.json(
        { message: "Role tidak ditemukan" },
        { status: 500 },
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("password", salt);

    const users = [
      {
        email: "admin@company.com",
        name: "Administrator",
        roleId: adminRole.id,
        password: hashedPassword,
        salt,
        currentToken: "",
        nik: "ADM001",
        position: "Head of IT",
        departmentId: managementDept?.id,
        joinDate: new Date(),
      },
      {
        email: "karyawan@company.com",
        name: "Budi Santoso",
        roleId: employeeRole.id,
        password: hashedPassword,
        salt,
        currentToken: "",
        nik: "EMP001",
        position: "Staff",
        departmentId: itDept?.id,
        joinDate: new Date(),
      },
    ];

    const createdUsers = [];

    for (const userData of users) {
      let user = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (!user) {
        user = await prisma.user.create({
          data: userData,
        });

        createdUsers.push(user);
      }
    }

    return NextResponse.json({
      message: "Seed berhasil",
      roles: createdRoles,
      departments: createdDepartments,
      newUsers: createdUsers,
      credentials: {
        admin: {
          email: "admin@company.com",
          password: "password",
        },
        employee: {
          email: "karyawan@company.com",
          password: "password",
        },
      },
    });
  } catch (error) {
    console.error("SEED ERROR:", error);

    return NextResponse.json(
      {
        message: "Seed gagal",
        error: String(error),
      },
      { status: 500 },
    );
  }
}
