export type BillingCycle = "MONTHLY" | "YEARLY";
export type SubscriptionStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED";
export type SubscriptionTab = "subscriptions" | "plans" | "payment-methods";

export interface PlanDto {
  id: string;
  name: string;
  description: string;
  featureDescription: string[];
  featurePermission: string[];
  price: number | null;
  type: BillingCycle;
  isActive: boolean;
}

export interface PaymentMethodDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  provider: string;
  providerCode: string | null;
  category: string;
  feeType: "fixed" | "percentage" | "hybrid";
  feeFixed: string;
  feePercentage: string;
  feeBearer: "customer" | "merchant";
  minAmount: string;
  maxAmount: string | null;
  iconUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface TenantSubscriptionDto {
  id: string;
  tenantId: string;
  planId: string;
  paymentMethodId: string | null;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  tenant: { id: string; companyName: string };
  plan: { id: string; name: string; type: BillingCycle; price: number | null };
  paymentMethod: { id: string; name: string; provider: string } | null;
}

export type SubscriptionRowMap = {
  subscriptions: TenantSubscriptionDto;
  plans: PlanDto;
  "payment-methods": PaymentMethodDto;
};

export type SubscriptionRow = SubscriptionRowMap[SubscriptionTab];
export type TenantOption = Pick<TenantSubscriptionDto["tenant"], "id" | "companyName">;
export type PlanOption = Pick<PlanDto, "id" | "name" | "type" | "price" | "isActive">;
export type PaymentMethodOption = Pick<PaymentMethodDto, "id" | "name" | "provider" | "isActive">;
