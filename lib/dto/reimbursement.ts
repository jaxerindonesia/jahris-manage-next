export interface ReimbursementDetailDto {
    id?: string;
    category: string;
    amount: number;
    date: string;
    receiptUrl?: string | null;
    receiptUrls?: string[];
}

export interface ReimbursementDto {
    id?: string | null;
    referenceNumber?: string | null;
    userId: string;
    title: string;
    category: string;
    amount: number;
    date: string;
    bankName?: string | null;
    accountNumber?: string | null;
    description?: string | null;
    receiptUrl?: string | null;
    details?: ReimbursementDetailDto[];
    status: string;
    approvedBy?: string | null;
    approvedAt?: string | null;
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
}
