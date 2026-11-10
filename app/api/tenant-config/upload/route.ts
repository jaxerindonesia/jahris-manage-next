export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { uploadBase64ToMinio, BUCKET_AVATARS } from "@/lib/minio";
import { requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";
import { buildTenantStorageObjectName } from "@/lib/helper/storage";
import { writeAuditLog } from "@/lib/security/audit-log";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp } from "@/lib/security/request";
import { validateBase64Image } from "@/lib/security/file-validation";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "tenants", "update");
    if (forbid) return forbid;
    const rateLimit = await consumeRateLimit({
      key: `upload:tenant-logo:${auth.user.id}:${getRequestIp(req)}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      writeAuditLog({
        action: "tenants.upload_logo",
        status: "denied",
        request: req,
        actorUserId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.roleName,
        tenantId: auth.user.tenantId,
        message: "Tenant logo upload rate limit exceeded",
      });
      return NextResponse.json(
        { message: "Terlalu banyak upload. Coba lagi beberapa menit lagi." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const body = await req.json();
    const { imageBase64 } = body;

    if (!imageBase64) {
      return NextResponse.json({ message: "No image provided" }, { status: 400 });
    }

    const validation = validateBase64Image(imageBase64, { maxBytes: 3 * 1024 * 1024 });
    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: 415 });
    }

    const filename = await buildTenantStorageObjectName(
      auth.user.tenantId,
      "company-logos",
      `logo-${randomUUID()}.${validation.extension}`,
    );
    const url = await uploadBase64ToMinio(
      imageBase64,
      filename,
      BUCKET_AVATARS,
      validation.contentType,
    );

    writeAuditLog({
      action: "tenants.upload_logo",
      status: "success",
      request: req,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.roleName,
      tenantId: auth.user.tenantId,
      targetType: "tenant_logo",
      message: "Tenant logo uploaded",
      metadata: {
        fileName: filename,
        contentType: validation.contentType,
      },
    });

    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error("Upload tenant logo error:", error);
    return NextResponse.json({ message: "Upload gagal" }, { status: 500 });
  }
}
