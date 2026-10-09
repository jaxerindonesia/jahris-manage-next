import type { PaymentMethodDto, PlanDto, TenantSubscriptionDto } from "@/lib/dto/subscription";
import type { PaymentMethodOption, PlanOption, SubscriptionTab, TenantOption } from "./types";

const endpoints: Record<SubscriptionTab, string> = {
  subscriptions: "/api/tenant-subscriptions",
  plans: "/api/plans",
  "payment-methods": "/api/payment-methods",
};

async function readResponse(response: Response, fallback: string) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.message || fallback);
  return json;
}

export async function fetchSubscriptionRows(tab: SubscriptionTab, page: number, limit: number, search: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set("search", search);
  const json = await readResponse(await fetch(`${endpoints[tab]}?${params}`), "Gagal mengambil data subscription");
  return json as { data: Array<TenantSubscriptionDto | PlanDto | PaymentMethodDto>; total: number };
}

export async function saveSubscriptionRow(tab: SubscriptionTab, payload: object, id?: string) {
  const response = await fetch(id ? `${endpoints[tab]}/${id}` : endpoints[tab], { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return readResponse(response, "Gagal menyimpan data");
}

export async function deleteSubscriptionRow(tab: SubscriptionTab, id: string) {
  return readResponse(await fetch(`${endpoints[tab]}/${id}`, { method: "DELETE" }), "Gagal menghapus data");
}

export async function fetchSubscriptionOptions() {
  const [tenantResponse, planResponse, paymentResponse] = await Promise.all([
    fetch("/api/tenants?page=1&limit=100"),
    fetch("/api/plans?page=1&limit=100&active=true"),
    fetch("/api/payment-methods?page=1&limit=100"),
  ]);
  const [tenants, plans, payments] = await Promise.all([
    readResponse(tenantResponse, "Gagal mengambil tenant"),
    readResponse(planResponse, "Gagal mengambil plan"),
    readResponse(paymentResponse, "Gagal mengambil metode pembayaran"),
  ]);
  return { tenants: tenants.data as TenantOption[], plans: plans.data as PlanOption[], payments: (payments.data as PaymentMethodOption[]).filter((item) => item.isActive) };
}
