export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { canManageTaskDepartment } from "@/lib/auth/task-management";
import { requirePermission } from "@/lib/auth/permission";
import { ensureRequestQueueList } from "@/lib/helper/task-public-request";

const DEFAULT_LISTS = ["Antrian Request", "To Do", "On Progress", "Review", "Done"];

async function ensureDepartment(departmentId: string, tenantId: string | null) {
  return prisma.department.findFirst({
    where: {
      id: departmentId,
      ...(tenantId ? { tenantId } : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      tenantId: true,
      branchId: true,
      tenant: { select: { companyName: true } },
      branch: { select: { id: true, name: true, code: true } },
      users: {
        where: { deletedAt: null, status: "active" },
        select: { id: true, name: true, email: true, position: true, avatarUrl: true },
        orderBy: { name: "asc" },
      },
    },
  });
}

async function ensureBoard(departmentId: string, tenantId: string | null) {
  const board = await prisma.taskBoard.findFirst({
    where: {
      departmentId,
      ...(tenantId ? { tenantId } : {}),
    },
    select: { id: true, departmentId: true, tenantId: true },
  });

  if (board) return board;

  return prisma.taskBoard.create({
    data: {
      departmentId,
      tenantId,
      name: "Task Board",
    },
    select: { id: true, departmentId: true, tenantId: true },
  });
}

async function ensureDefaultLists(boardId: string) {
  const lists = await prisma.taskList.findMany({
    where: { boardId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, position: true },
  });

  if (lists.length === 0) {
    await prisma.taskList.createMany({
      data: DEFAULT_LISTS.map((name, index) => ({
        name,
        position: index,
        boardId,
      })),
    });
    return;
  }

  const hasOnProgress = lists.some((list) => list.name.toLowerCase() === "on progress");
  const oldOnProcess = lists.find((list) => list.name.toLowerCase() === "on process");
  if (oldOnProcess && !hasOnProgress) {
    await prisma.taskList.update({
      where: { id: oldOnProcess.id },
      data: { name: "On Progress" },
    });
  }
}

const listInclude = {
  tasks: {
    orderBy: [{ position: "asc" as const }, { createdAt: "desc" as const }],
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, position: true, avatarUrl: true },
          },
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" as const },
      },
      categories: {
        include: {
          category: true,
        },
      },
    },
  },
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "task-managements", "get-all");
    if (forbid) return forbid;

    const departmentId = req.nextUrl.searchParams.get("departmentId") || "";
    if (!departmentId) {
      return NextResponse.json(
        { message: "Department is required" },
        { status: 400 },
      );
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    const department = await ensureDepartment(departmentId, scopedTenantId);
    if (!department) {
      return NextResponse.json(
        { message: "Department not found" },
        { status: 404 },
      );
    }
    const board = await ensureBoard(departmentId, department.tenantId);
    await ensureDefaultLists(board.id);
    await ensureRequestQueueList(departmentId, department.tenantId);

    const lists = await prisma.taskList.findMany({
      where: { boardId: board.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: listInclude,
    });

    return NextResponse.json({
      message: "Task board retrieved successfully",
      data: {
        department,
        board,
        lists,
      },
    });
  } catch (error) {
    console.error("GET TASK LISTS ERROR:", error);
    return NextResponse.json(
      { message: "Failed to retrieve task board" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "task-managements", "create");
    if (forbid) return forbid;

    const body = await req.json();
    const name = String(body.name || "").trim();
    const departmentId = String(body.departmentId || "");

    if (!name || !departmentId) {
      return NextResponse.json(
        { message: "List name and department are required" },
        { status: 400 },
      );
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    const department = await ensureDepartment(departmentId, scopedTenantId);
    if (!department) {
      return NextResponse.json(
        { message: "Department not found" },
        { status: 404 },
      );
    }
    if (!canManageTaskDepartment(auth.user, departmentId)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const board = await ensureBoard(departmentId, department.tenantId);
    const position =
      body.position !== undefined
        ? Number(body.position)
        : await prisma.taskList.count({ where: { boardId: board.id } });

    const list = await prisma.taskList.create({
      data: {
        name,
        position,
        boardId: board.id,
      },
    });

    return NextResponse.json(
      {
        message: "Task list successfully created",
        data: list,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("CREATE TASK LIST ERROR:", error);
    return NextResponse.json(
      { message: "Failed to create task list" },
      { status: 500 },
    );
  }
}
