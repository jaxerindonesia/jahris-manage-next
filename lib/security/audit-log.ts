import type { NextRequest } from "next/server";
import { getRequestIp } from "@/lib/security/request";

type AuditAction =
  | "auth.login_success"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.change_password_success"
  | "auth.change_password_failed"
  | "users.import"
  | "users.delete"
  | "roles.delete"
  | "departments.delete"
  | "submissions.approve"
  | "submissions.reject"
  | "submissions.delete"
  | "overtimes.approve"
  | "overtimes.reject"
  | "overtimes.delete"
  | "pettycash.update"
  | "pettycash.delete"
  | "tasks.create"
  | "tasks.update"
  | "tasks.delete"
  | "finance.import_customers"
  | "finance.import_vendors"
  | "finance.import_accounts"
  | "finance.journals.create"
  | "finance.journals.update"
  | "finance.journals.delete"
  | "tenants.update"
  | "tenants.upload_logo"
  | "tenants.reset_logo"
  | "reimbursements.approve"
  | "reimbursements.reject";

type AuditStatus = "success" | "failed" | "denied";

type AuditLogInput = {
  action: AuditAction;
  status: AuditStatus;
  request?: NextRequest | Request;
  actorUserId?: string | null;
  actorRole?: string | null;
  tenantId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function writeAuditLog(input: AuditLogInput) {
  const requestPath = input.request
    ? new URL(input.request.url).pathname
    : null;

  const payload = {
    timestamp: new Date().toISOString(),
    category: "security_audit",
    action: input.action,
    status: input.status,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    tenantId: input.tenantId ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    ipAddress: input.request ? getRequestIp(input.request) : null,
    method: input.request?.method ?? null,
    path: requestPath,
    message: input.message ?? null,
    metadata: input.metadata ?? null,
  };

  const serialized = JSON.stringify(payload);

  if (input.status === "failed" || input.status === "denied") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}
