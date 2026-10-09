import type { PaymentMethodDto, PlanDto, TenantSubscriptionDto } from "@/lib/dto/subscription";

export type SubscriptionTab = "subscriptions" | "plans" | "payment-methods";
export type SubscriptionRow = TenantSubscriptionDto | PlanDto | PaymentMethodDto;
export type TenantOption = { id: string; companyName: string };
export type PlanOption = Pick<PlanDto, "id" | "name" | "type" | "price" | "isActive">;
export type PaymentMethodOption = Pick<PaymentMethodDto, "id" | "name" | "provider" | "isActive">;
