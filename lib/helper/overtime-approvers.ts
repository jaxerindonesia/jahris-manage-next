import type { Prisma } from "@prisma/client";

export async function getOvertimeApproverIds(db: Prisma.TransactionClient, tenantId: string | null) {
  const configured = await db.overtimeApproverConfig.findMany({
    where: { tenantId, approverUser: { tenantId, deletedAt: null } },
    select: { approverUserId: true },
  });
  if (configured.length) return configured.map((item) => item.approverUserId);
  const admins = await db.user.findMany({
    where: { tenantId, deletedAt: null, role: { name: { in: ["Admin", "Super Admin"] } } },
    select: { id: true },
  });
  return admins.map((user) => user.id);
}
