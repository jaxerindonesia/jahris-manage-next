import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";

const NOMINAL_FIELDS = ["payoutAmount", "hourlyRate", "dailyRate"] as const;

function isEmployeeRole(roleName: string) {
  return roleName.toLowerCase().replace(/\s/g, "") === "karyawan";
}

export async function shouldHideOvertimeNominal(
  db: Prisma.TransactionClient,
  user: SessionUser,
  tenantId: string | null,
) {
  if (!isEmployeeRole(user.roleName)) return false;
  const config = await db.overtimeConfig.findFirst({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    select: { hideNominal: true },
  });
  return config?.hideNominal ?? false;
}

export function maskOvertimeNominal<T extends object>(overtime: T): T {
  const masked = { ...overtime } as Record<string, unknown>;
  NOMINAL_FIELDS.forEach((field) => {
    if (field in masked) masked[field] = null;
  });
  return masked as T;
}
