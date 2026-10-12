import type { Prisma } from "@prisma/client";

export async function syncTenantSubscriptionPeriod(
  transaction: Prisma.TransactionClient,
  tenantId: string,
) {
  const activeSubscription = await transaction.tenantSubscription.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
    select: { startDate: true, endDate: true },
  });

  await transaction.tenant.update({
    where: { id: tenantId },
    data: {
      subscriptionStart: activeSubscription?.startDate ?? null,
      subscriptionEnd: activeSubscription?.endDate ?? null,
    },
  });
}
