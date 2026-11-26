export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireSessionUser } from "@/lib/auth/tenant";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { uploadBufferToMinio, BUCKET_AVATARS } from "@/lib/minio";
import { requirePermission } from "@/lib/auth/permission";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp } from "@/lib/security/request";
import { validateAttachmentBuffer } from "@/lib/security/file-validation";
import {
  TASK_ATTACHMENT_MAX_SIZE,
  inferTaskAttachmentKind,
  isAllowedTaskAttachment,
  safeAttachmentName,
} from "@/lib/helper/attachment";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "task-managements", "update");
    if (forbid) return forbid;
    const rateLimit = await consumeRateLimit({
      key: `upload:task-attachment:${auth.user.id}:${getRequestIp(req)}`,
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: "Terlalu banyak upload. Coba lagi beberapa menit lagi." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ message: "File is required" }, { status: 400 });
    }
    if (file.size > TASK_ATTACHMENT_MAX_SIZE) {
      return NextResponse.json(
        { message: "File maksimal 10 MB" },
        { status: 413 },
      );
    }
    if (!isAllowedTaskAttachment(file.name || "")) {
      return NextResponse.json(
        {
          message: "Format file harus jpg, jpeg, png, pdf, xls, xlsx, csv, doc, docx, ppt, atau pptx",
        },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateAttachmentBuffer(
      file.name || "",
      file.type || "application/octet-stream",
      buffer,
    );
    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: 415 });
    }

    const fileName = safeAttachmentName(file.name || "attachment");
    const objectKey = await buildTenantStorageObjectName(
      auth.user.tenantId,
      "task-attachments",
      `${randomUUID()}-${fileName}`,
    );

    const url = await uploadBufferToMinio(
      buffer,
      objectKey,
      BUCKET_AVATARS,
      validation.contentType,
    );

    return NextResponse.json(
      {
        url,
        objectKey,
        name: file.name || fileName,
        type: inferTaskAttachmentKind(file.name || fileName, file.type || ""),
        size: file.size,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Upload task attachment error:", error);
    return NextResponse.json({ message: "Upload failed" }, { status: 500 });
  }
}
