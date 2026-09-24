export interface PettyCashUsageDto {
  id?: string;
  pettyCashId?: string;
  description: string;
  amount: number;
  usageDate: string | Date;
  receiptUrl?: string | null;
  receiptUrls?: string[];
  transactionType?: "EXPENSE" | "TOP_UP" | "RETURN";
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface PettyCashDto {
  id?: string;
  tenantId?: string | null;
  userId: string;
  purpose: string;
  category: string;
  amount: number;
  transferDate?: string | Date | null;
  bankName: string;
  accountNumber: string;
  status: string;
  createdBy?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  user?: {
    id: string;
    name: string;
    position?: string | null;
    department?:
      | string
      | {
          id?: string;
          name?: string | null;
        }
      | null;
  } | null;
  usages?: PettyCashUsageDto[];
}
