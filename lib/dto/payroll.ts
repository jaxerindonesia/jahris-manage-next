import type { PayrollComponentValueDto } from "@/lib/dto/payroll-component";
import type { SalaryType } from "@/lib/dto/user";

export interface PayrollDto {
    id?: string | null;
    userId: string;
    referenceNumber?: string | null;
    month: number;
    year: number;
    basicSalary: number;
    salaryType?: SalaryType;
    salaryRate?: number;
    paidAttendanceDays?: number;
    lateDeductionRate?: number;
    lateAttendanceDays?: number;
    lateDeductionAmount?: number;
    absentAttendanceDays?: number;
    absentDeductionAmount?: number;
    allowances: number;
    deductions: number;
    totalSalary: number;
    status: string;
    paidAt?: Date | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
    componentValues?: PayrollComponentValueDto[];
    user?: {
        id: string;
        name: string;
        position?: string | null;
        department?: string | { name?: string | null } | null;
    } | null;
}
