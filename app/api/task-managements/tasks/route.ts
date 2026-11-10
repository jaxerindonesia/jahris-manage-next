export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { canManageTaskDepartment } from "@/lib/auth/task-management";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";

type AttachmentInput = {
  name: string;
  url: string;
  objectKey: string | null;
  type: string | null;
};

function normalizeAttachments(value: unknown): AttachmentInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw) => {
      const item = raw as { name?: unknown; url?: unknown; objectKey?: unknown; type?: unknown };
      return {
        name: String(item.name || item.url || "").trim(),
        url: String(item.url || "").trim(),
        objectKey: item.objectKey ? String(item.objectKey).trim() : null,
        type: item.type ? String(item.type).trim() : null,
      };
    })
    .filter((item) => item.name && item.url);
}

async function resolveList(listId: string, departmentId: string, tenantId: string | null) {
  return prisma.taskList.findFirst({
    where: {
      id: listId,
      ...(tenantId ? { board: { tenantId } } : {}),
    },
    include: {
      board: {
        select: { id: true, departmentId: true, tenantId: true },
      },
    },
  });
}

async function validateMembers(memberIds: string[], departmentId: string, tenantId: string | null) {
  const uniqueIds = Array.from(new Set(memberIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: {
      id: { in: uniqueIds },
      departmentId,
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
    },
    select: { id: true },
  });

  if (users.length !== uniqueIds.length) return null;
  return uniqueIds;
}

async function validateCategories(categoryIds: string[], departmentId: string) {
  const uniqueIds = Array.from(new Set(categoryIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const categories = await prisma.taskCategory.findMany({
    where: {
      id: { in: uniqueIds },
      departmentId,
    },
    select: { id: true },
  });

  if (categories.length !== uniqueIds.length) return null;
  return uniqueIds;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "task-managements", "create");
    if (forbid) return forbid;

    const body = await req.json();
    const title = String(body.title || "").trim();
    const departmentId = String(body.departmentId || "");
    const listId = String(body.listId || "");

    if (!title || !departmentId || !listId) {
      return NextResponse.json(
        { message: "Task title, department, and list are required" },
        { status: 400 },
      );
    }

    const scopedTenantId = ensureTenantScope(auth.user);
    if (!canManageTaskDepartment(auth.user, departmentId)) {
      return NextResponse.json(
        { message: "Forbidden" },
        { status: 403 },
      );
    }
    const list = await resolveList(listId, departmentId, scopedTenantId);
    if (
      !list ||
      list.board.departmentId !== departmentId ||
      (scopedTenantId && list.board.tenantId !== scopedTenantId)
    ) {
      return NextResponse.json(
        { message: "Task list not found" },
        { status: 404 },
      );
    }

    const memberIds = await validateMembers(
      Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
      departmentId,
      scopedTenantId,
    );
    if (memberIds === null) {
      return NextResponse.json(
        { message: "Selected members must belong to this department" },
        { status: 400 },
      );
    }

    const categoryIds = await validateCategories(
      Array.isArray(body.categoryIds) ? body.categoryIds.map(String) : [],
      departmentId,
    );
    if (categoryIds === null) {
      return NextResponse.json(
        { message: "Selected categories must belong to this department" },
        { status: 400 },
      );
    }

    const attachments = normalizeAttachments(body.attachments);
    const position =
      body.position !== undefined
        ? Number(body.position)
        : await prisma.task.count({ where: { listId } });
    const startDate = body.startDate ? new Date(body.startDate) : new Date();
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;

    if (Number.isNaN(startDate.getTime()) || (dueDate && Number.isNaN(dueDate.getTime()))) {
      return NextResponse.json(
        { message: "Format tanggal task tidak valid" },
        { status: 400 },
      );
    }

    if (dueDate && dueDate < startDate) {
      return NextResponse.json(
        { message: "Tanggal jatuh tempo tidak boleh sebelum tanggal mulai task" },
        { status: 400 },
      );
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: body.description ? String(body.description) : null,
        startDate,
        dueDate,
        position,
        listId,
        departmentId,
        createdById: auth.user.id,
        tenantId: list.board.tenantId,
        members: {
          create: memberIds.map((userId) => ({ userId })),
        },
        categories: {
          create: categoryIds.map((categoryId) => ({ categoryId })),
        },
        attachments: {
          create: attachments.map((attachment) => ({
            name: attachment.name,
            url: attachment.url,
            objectKey: attachment.objectKey,
            type: attachment.type || null,
          })),
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, position: true, avatarUrl: true } },
          },
        },
        categories: {
          include: { category: true },
        },
        attachments: true,
      },
    });

    writeAuditLog({
      action: "tasks.create",
      status: "success",
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "task",
      targetId: task.id,
      message: "Task created",
      metadata: {
        departmentId,
        listId,
      },
    });

    return NextResponse.json(
      {
        message: "Task successfully created",
        data: task,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("CREATE TASK ERROR:", error);
    return NextResponse.json(
      { message: "Failed to create task" },
      { status: 500 },
    );
  }
}
