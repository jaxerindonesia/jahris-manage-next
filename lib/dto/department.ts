export interface DepartmentDto {
  id: string;
  name: string;
  code?: string | null;
  tenantId?: string | null;
  branchId?: string | null;
  tenant?: { id: string; companyName: string } | null;
  branch?: { id: string; name: string; code?: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}
