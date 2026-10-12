import type {
  PaymentMethodOption,
  PlanOption,
  SubscriptionRowMap,
  SubscriptionTab,
  TenantOption,
} from "@/lib/dto/subscription";

type PaginatedResponse<T> = {
  data: T[];
  total: number;
};

const endpoints: Record<SubscriptionTab, string> = {
  subscriptions: "/api/tenant-subscriptions",
  plans: "/api/plans",
  "payment-methods": "/api/payment-methods",
};

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof json?.message === "string" ? json.message : fallback;
    throw new Error(message);
  }
  return json as T;
}

export async function fetchManagementRows<TTab extends SubscriptionTab>(
  tab: TTab,
  page: number,
  limit: number,
  search: string,
): Promise<PaginatedResponse<SubscriptionRowMap[TTab]>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set("search", search);

  return readResponse(
    await fetch(`${endpoints[tab]}?${params}`),
    "Gagal mengambil data manajemen langganan",
  );
}

export async function saveManagementRow(
  tab: SubscriptionTab,
  payload: object,
  id?: string,
) {
  return readResponse(
    await fetch(id ? `${endpoints[tab]}/${id}` : endpoints[tab], {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Gagal menyimpan data",
  );
}

export async function deleteManagementRow(tab: SubscriptionTab, id: string) {
  return readResponse(
    await fetch(`${endpoints[tab]}/${id}`, { method: "DELETE" }),
    "Gagal menghapus data",
  );
}

async function fetchAllOptions<T>(
  endpoint: string,
  fallback: string,
  extraParams: Record<string, string> = {},
) {
  const limit = 100;
  const items: T[] = [];
  let page = 1;
  let total = 0;
  let received = 0;

  do {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...extraParams,
    });
    const response = await readResponse<PaginatedResponse<T>>(
      await fetch(`${endpoint}?${params}`),
      fallback,
    );
    items.push(...response.data);
    received = response.data.length;
    total = response.total;
    page += 1;
  } while (received > 0 && items.length < total);

  return items;
}

export async function fetchSubscriptionOptions() {
  const [tenants, plans, payments] = await Promise.all([
    fetchAllOptions<TenantOption>("/api/tenants", "Gagal mengambil tenant"),
    fetchAllOptions<PlanOption>("/api/plans", "Gagal mengambil plan", { active: "true" }),
    fetchAllOptions<PaymentMethodOption>(
      "/api/payment-methods",
      "Gagal mengambil metode pembayaran",
    ),
  ]);

  return {
    tenants,
    plans,
    payments: payments.filter((item) => item.isActive),
  };
}
