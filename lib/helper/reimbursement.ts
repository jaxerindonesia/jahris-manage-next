import type { ReimbursementDto, ReimbursementDetailDto } from "@/lib/dto/reimbursement";

export const REIMBURSEMENT_CATEGORIES = [
  "Transportasi", "Akomodasi", "Makan & Minum", "Kesehatan",
  "Peralatan Kerja", "Komunikasi", "Lainnya",
];

export function getReceiptUrls(detail: { receiptUrls?: string[]; receiptUrl?: string | null }): string[] {
  return detail.receiptUrls ?? (detail.receiptUrl ? [detail.receiptUrl] : []);
}

export function getReimbursementDetails(claim: ReimbursementDto): ReimbursementDetailDto[] {
  return claim.details?.length ? claim.details : [{
    category: claim.category, amount: claim.amount, date: claim.date, receiptUrl: claim.receiptUrl,
  }];
}
