export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit-log";
import { validateAttachmentBuffer } from "@/lib/security/file-validation";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { uploadBufferToMinio, BUCKET_AVATARS } from "@/lib/minio";
import {
  TASK_ATTACHMENT_MAX_SIZE,
  inferTaskAttachmentKind,
  isAllowedTaskAttachment,
  safeAttachmentName,
} from "@/lib/helper/attachment";
import { createWithTicketRetry, generateTaskTicketNumber } from "@/lib/helper/task-ticket";
import {
  PUBLIC_REQUEST_MAX_FILES,
  PUBLIC_REQUEST_OTHER_DIVISION,
  PUBLIC_REQUEST_PRIORITIES,
  PUBLIC_REQUEST_SOURCE,
  PUBLIC_REQUEST_TYPES,
  ensureRequestQueueList,
  resolvePublicRequestToken,
} from "@/lib/helper/task-public-request";
import { sendTaskRequestConfirmation } from "@/lib/helper/task-public-request-mail";
import type {
  TaskPublicRequestFormDto,
  TaskPublicRequestResultDto,
} from "@/lib/dto/task-public-request";

type RouteContext = { params: Promise<{ token: string }> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalidLink = () => NextResponse.json(
  { message: "Link request tidak valid atau sudah tidak aktif" },
  { status: 404 },
);

async function listDivisions(tenantId: string | null) {
  if (!tenantId) return [PUBLIC_REQUEST_OTHER_DIVISION];
  const departments = await prisma.department.findMany({
    where: { tenantId, deletedAt: null },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const names = Array.from(new Set(departments.map((department) => department.name)));
  return [...names, PUBLIC_REQUEST_OTHER_DIVISION];
}

function text(formData: FormData, key: string, maxLength = 200) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params;
    const department = await resolvePublicRequestToken(token);
    if (!department) return invalidLink();

    const data: TaskPublicRequestFormDto = {
      companyName: department.tenant?.companyName || "",
      companyLogoUrl: department.tenant?.logoUrl || null,
      departmentName: department.name,
      divisions: await listDivisions(department.tenantId),
      requestTypes: [...PUBLIC_REQUEST_TYPES],
      priorities: PUBLIC_REQUEST_PRIORITIES.map((priority) => ({ ...priority })),
      maxFiles: PUBLIC_REQUEST_MAX_FILES,
    };
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET PUBLIC TASK REQUEST FORM ERROR:", error);
    return NextResponse.json({ message: "Gagal memuat form" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const rateLimit = await consumeRateLimit({
      key: `public-task-request:${getRequestIp(req)}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: "Terlalu banyak request. Coba lagi beberapa menit lagi." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const { token } = await params;
    const department = await resolvePublicRequestToken(token);
    if (!department || !department.publicRequestUserId) return invalidLink();

    const formData = await req.formData();
    const email = text(formData, "email");
    const name = text(formData, "name");
    const division = text(formData, "division");
    const phone = text(formData, "phone", 50);
    const requestType = text(formData, "requestType");
    const title = text(formData, "title");
    const description = text(formData, "description", 5000);
    const priority = text(formData, "priority");
    const neededDateRaw = text(formData, "neededDate", 20);

    const divisions = await listDivisions(department.tenantId);
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ message: "Email tidak valid" }, { status: 400 });
    }
    if (!name || !title || !description) {
      return NextResponse.json({ message: "Nama, judul, dan deskripsi wajib diisi" }, { status: 400 });
    }
    if (!divisions.includes(division)) {
      return NextResponse.json({ message: "Divisi tidak valid" }, { status: 400 });
    }
    if (!(PUBLIC_REQUEST_TYPES as readonly string[]).includes(requestType)) {
      return NextResponse.json({ message: "Jenis request tidak valid" }, { status: 400 });
    }
    if (!PUBLIC_REQUEST_PRIORITIES.some((item) => item.value === priority)) {
      return NextResponse.json({ message: "Prioritas tidak valid" }, { status: 400 });
    }

    const startDate = new Date();
    const neededDate = neededDateRaw ? new Date(`${neededDateRaw}T00:00:00`) : null;
    if (neededDate && Number.isNaN(neededDate.getTime())) {
      return NextResponse.json({ message: "Tanggal dibutuhkan tidak valid" }, { status: 400 });
    }

    const files = formData.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
    if (files.length > PUBLIC_REQUEST_MAX_FILES) {
      return NextResponse.json({ message: `Maksimal ${PUBLIC_REQUEST_MAX_FILES} file` }, { status: 400 });
    }

    const validatedFiles = [];
    for (const file of files) {
      if (file.size > TASK_ATTACHMENT_MAX_SIZE) {
        return NextResponse.json({ message: `${file.name}: maksimal 10 MB` }, { status: 413 });
      }
      if (!isAllowedTaskAttachment(file.name || "")) {
        return NextResponse.json({ message: `${file.name}: format file tidak didukung` }, { status: 415 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const validation = validateAttachmentBuffer(file.name || "", file.type || "application/octet-stream", buffer);
      if (!validation.ok) {
        return NextResponse.json({ message: validation.message }, { status: 415 });
      }
      validatedFiles.push({ file, buffer, contentType: validation.contentType });
    }

    const attachments: { name: string; url: string; objectKey: string; type: string; size: number }[] = [];
    for (const { file, buffer, contentType } of validatedFiles) {
      const fileName = safeAttachmentName(file.name || "attachment");
      const objectKey = await buildTenantStorageObjectName(
        department.tenantId,
        "task-attachments",
        `${randomUUID()}-${fileName}`,
      );
      const url = await uploadBufferToMinio(buffer, objectKey, BUCKET_AVATARS, contentType);
      attachments.push({
        name: file.name || fileName,
        url,
        objectKey,
        type: inferTaskAttachmentKind(file.name || fileName, file.type || ""),
        size: file.size,
      });
    }

    const queueList = await ensureRequestQueueList(department.id, department.tenantId);
    const position = await prisma.task.count({ where: { listId: queueList.id, deletedAt: null } });
    const createdById = department.publicRequestUserId;

    const task = await createWithTicketRetry(async () =>
      prisma.task.create({
        data: {
          title,
          description,
          priority,
          requester: name,
          requesterEmail: email,
          requesterPhone: phone || null,
          requesterDivision: division,
          requestType,
          source: PUBLIC_REQUEST_SOURCE,
          ticketNumber: await generateTaskTicketNumber(prisma, department),
          startDate,
          dueDate: neededDate && neededDate >= startDate ? neededDate : null,
          position,
          listId: queueList.id,
          departmentId: department.id,
          tenantId: department.tenantId,
          createdById,
          attachments: { create: attachments },
        },
        select: { id: true, ticketNumber: true },
      }),
    );

    writeAuditLog({
      action: "tasks.public_request_submit",
      status: "success",
      request: req,
      tenantId: department.tenantId,
      targetType: "task",
      targetId: task.id,
      message: "Public task request submitted",
      metadata: { departmentId: department.id },
    });

    let emailSent = false;
    try {
      const mail = await sendTaskRequestConfirmation({
        tenantId: department.tenantId,
        to: email,
        companyName: department.tenant?.companyName || "",
        departmentName: department.name,
        ticketNumber: task.ticketNumber,
        requesterName: name,
        title,
        requestType,
        priority,
      });
      emailSent = mail.sent;
    } catch (error) {
      console.error("SEND PUBLIC TASK REQUEST EMAIL ERROR:", error);
    }

    const data: TaskPublicRequestResultDto = { ticketNumber: task.ticketNumber, emailSent };
    return NextResponse.json({ message: "Request berhasil dikirim", data }, { status: 201 });
  } catch (error) {
    console.error("SUBMIT PUBLIC TASK REQUEST ERROR:", error);
    return NextResponse.json({ message: "Gagal mengirim request" }, { status: 500 });
  }
}
