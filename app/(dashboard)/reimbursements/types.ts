import type { ReimbursementDetailDto } from "@/lib/dto/reimbursement";

export interface ReimbursementDetailForm extends ReimbursementDetailDto {
  key: string;
  description: string;
  files: File[];
  receiptUrls: string[];
}

export interface ReimbursementForm {
  id?: string | null;
  userId: string;
  title: string;
  bankName: string;
  accountNumber: string;
  description: string;
  details: ReimbursementDetailForm[];
}
