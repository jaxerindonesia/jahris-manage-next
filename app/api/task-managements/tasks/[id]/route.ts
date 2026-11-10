export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { canManageTaskDepartment } from "@/lib/auth/task-management";
import { deleteFromMinio, BUCKET_AVATARS } from "@/lib/minio";
import { requirePermission } from "@/lib/auth/permission";
import { writeAuditLog } from "@/lib/security/audit-log";

type Params = {
  params: {
    id: string;
  };
};

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

function isMinioUrl(url: string) {
  return url.includes(BUCKET_AVATARS);
}

function canUseAnyDepartment(roleName: string) {
  const normalized = roleName.toLowerCase().replace(/\s/g, "");
  return normalized === "superadmin" || normalized === "admin";
}

function isDoneListName(name: string) {
  const normalized = name.toLowerCase();
  return ["done", "completed", "selesai"].some((keyword) => normalized.includes(keyword));
}

async function canMoveTaskToDone(taskDepartmentId: string, userId: string, roleName: string) {
  if (canUseAnyDepartment(roleName)) return true;

  const permissions = await prisma.taskDoneMovePermission.findMany({
    where: { departmentId: taskDepartmentId },
    select: { userId: true },
  });

  if (permissions.length === 0) return true;
  return permissions.some((permission) => permission.userId === userId);
}

async function deleteTaskAttachments(attachments: { url: string | null; objectKey?: string | null }[]) {
  await Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.objectKey) {
        await deleteFromMinio(attachment.objectKey);
      } else if (attachment.url && isMinioUrl(attachment.url)) {
        await deleteFromMinio(attachment.url);
      }
    }),
  );
}

async function findScopedTask(id: string, tenantId: string | null) {
  return prisma.task.findFirst({
    where: {
      id,
      ...(tenantId ? { tenantId } : {}),
    },
    include: {
      list: { select: { id: true, board: { select: { id: true, departmentId: true, tenantId: true } } } },
      categories: {
        include: { category: true },
      },
    },
  });
}

async function validateList(listId: string, departmentId: string, tenantId: string | null) {
  return prisma.taskList.findFirst({
    where: {
      id: listId,
      ...(tenantId ? { board: { tenantId } } : {}),
    },
    select: {
      id: true,
      name: true,
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

export async function PUT(req: Request, { params }: Params) {
  const p = await params;

  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "task-managements", "update");
    if (forbid) return forbid;

    const scopedTenantId = ensureTenantScope(auth.user);
    const existing = await findScopedTask(p.id, scopedTenantId);
    if (!existing) {
      return NextResponse.json({ message: "Task not found" }, { status: 404 });
    }
    if (!canUseAnyDepartment(auth.user.roleName) && auth.user.departmentId !== existing.list.board.departmentId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const nextListId =
      body.listId !== undefined ? String(body.listId) : existing.listId;

    if (nextListId !== existing.listId) {
      const nextList = await validateList(
        nextListId,
        existing.list.board.departmentId,
        scopedTenantId,
      );
      if (
        !nextList ||
        nextList.board.departmentId !== existing.list.board.departmentId ||
        (scopedTenantId && nextList.board.tenantId !== scopedTenantId)
      ) {
        return NextResponse.json(
          { message: "Target list not found for this department" },
          { status: 400 },
        );
      }

      if (isDoneListName(nextList.name)) {
        const allowed = await canMoveTaskToDone(
          existing.list.board.departmentId,
          auth.user.id,
          auth.user.roleName,
        );
        if (!allowed) {
          return NextResponse.json(
            { message: "You are not allowed to move task to Done" },
            { status: 403 },
          );
        }
      } else if (!canManageTaskDepartment(auth.user, existing.list.board.departmentId)) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
    }

    const updateData: {
      title?: string;
      description?: string | null;
      startDate?: Date;
      dueDate?: Date | null;
      position?: number;
      listId?: string;
    } = {};

    if (body.title !== undefined) {
      updateData.title = String(body.title).trim();
      if (!updateData.title) {
        return NextResponse.json(
          { message: "Task title is required" },
          { status: 400 },
        );
      }
    }
    if (body.description !== undefined) {
      updateData.description = body.description ? String(body.description) : null;
    }
    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate ? new Date(body.startDate) : new Date();
    }
    if (body.dueDate !== undefined) {
      updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.position !== undefined) {
      updateData.position = Number(body.position);
    }
    if (body.listId !== undefined) {
      updateData.listId = nextListId;
    }

    const effectiveStartDate =
      updateData.startDate ?? existing.startDate ?? existing.createdAt;
    const effectiveDueDate =
      updateData.dueDate !== undefined ? updateData.dueDate : existing.dueDate;

    if (
      (updateData.startDate && Number.isNaN(updateData.startDate.getTime())) ||
      (updateData.dueDate && Number.isNaN(updateData.dueDate.getTime()))
    ) {
      return NextResponse.json(
        { message: "Format tanggal task tidak valid" },
        { status: 400 },
      );
    }

    if (effectiveDueDate && effectiveStartDate && effectiveDueDate < effectiveStartDate) {
      return NextResponse.json(
        { message: "Tanggal jatuh tempo tidak boleh sebelum tanggal mulai task" },
        { status: 400 },
      );
    }

    const memberIds = body.memberIds
      ? await validateMembers(
          Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
          existing.list.board.departmentId,
          scopedTenantId,
        )
      : undefined;

    if (memberIds === null) {
      return NextResponse.json(
        { message: "Selected members must belong to this department" },
        { status: 400 },
      );
    }

    const categoryIds =
      body.categoryIds !== undefined
        ? await validateCategories(
            Array.isArray(body.categoryIds) ? body.categoryIds.map(String) : [],
            existing.list.board.departmentId,
          )
        : undefined;

    if (categoryIds === null) {
      return NextResponse.json(
        { message: "Selected categories must belong to this department" },
        { status: 400 },
      );
    }

    const attachments =
      body.attachments !== undefined
        ? normalizeAttachments(body.attachments)
        : undefined;

    const oldAttachments =
      attachments !== undefined
        ? await prisma.taskAttachment.findMany({
            where: { taskId: p.id },
            select: { url: true, objectKey: true },
          })
        : [];
    const nextAttachmentKeys = new Set(
      attachments
        ?.map((attachment) => attachment.objectKey || attachment.url)
        .filter(Boolean) || [],
    );
    const removedAttachments = attachments
      ? oldAttachments.filter(
          (attachment) =>
            (attachment.objectKey || attachment.url) &&
            !nextAttachmentKeys.has(attachment.objectKey || attachment.url),
        )
      : [];

    const task = await prisma.$transaction(async (tx) => {
      if (memberIds !== undefined) {
        await tx.taskMember.deleteMany({ where: { taskId: p.id } });
        if (memberIds.length > 0) {
          await tx.taskMember.createMany({
            data: memberIds.map((userId) => ({ taskId: p.id, userId })),
          });
        }
      }

      if (categoryIds !== undefined) {
        await tx.taskCategoryOnTask.deleteMany({ where: { taskId: p.id } });
        if (categoryIds.length > 0) {
          await tx.taskCategoryOnTask.createMany({
            data: categoryIds.map((categoryId) => ({ taskId: p.id, categoryId })),
          });
        }
      }

      if (attachments !== undefined) {
        await deleteTaskAttachments(removedAttachments);
        await tx.taskAttachment.deleteMany({ where: { taskId: p.id } });
        if (attachments.length > 0) {
          await tx.taskAttachment.createMany({
            data: attachments.map((attachment) => ({
              taskId: p.id,
              name: attachment.name,
              url: attachment.url,
              objectKey: attachment.objectKey,
              type: attachment.type,
            })),
          });
        }
      }

      return tx.task.update({
        where: { id: p.id },
        data: updateData,
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
    });

    writeAuditLog({
      action: "tasks.update",
      status: "success",
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "task",
      targetId: task.id,
      message: "Task updated",
      metadata: {
        movedList: body.listId !== undefined,
        updatedMembers: body.memberIds !== undefined,
        updatedCategories: body.categoryIds !== undefined,
      },
    });

    return NextResponse.json({
      message: "Task successfully updated",
      data: task,
    });
  } catch (error) {
    console.error("UPDATE TASK ERROR:", error);
    return NextResponse.json(
      { message: "Failed to update task" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const p = await params;

  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "task-managements", "delete");
    if (forbid) return forbid;

    const scopedTenantId = ensureTenantScope(auth.user);
    const existing = await findScopedTask(p.id, scopedTenantId);
    if (!existing) {
      return NextResponse.json({ message: "Task not found" }, { status: 404 });
    }
    if (!canUseAnyDepartment(auth.user.roleName) && auth.user.departmentId !== existing.list.board.departmentId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId: p.id },
      select: { url: true, objectKey: true },
    });
    await deleteTaskAttachments(attachments);

    await prisma.task.delete({ where: { id: p.id } });

    writeAuditLog({
      action: "tasks.delete",
      status: "success",
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "task",
      targetId: p.id,
      message: "Task deleted",
    });

    return NextResponse.json({
      message: "Task successfully deleted",
    });
  } catch (error) {
    console.error("DELETE TASK ERROR:", error);
    return NextResponse.json(
      { message: "Failed to delete task" },
      { status: 500 },
    );
  }
}
