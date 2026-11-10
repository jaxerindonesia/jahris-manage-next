export type ActivityLogTenantOption = {
  id: string;
  companyName: string;
};

export interface ActivityLogFilter {
  search: string;
  module: string;
  tenantId: string;
}

export const ACTIVITY_LOG_MODULES = [
  { value: "attendances", label: "Kehadiran" },
  { value: "users", label: "Karyawan" },
  { value: "payrolls", label: "Payroll" },
  { value: "submissions", label: "Pengajuan" },
  { value: "overtimes", label: "Lembur" },
  { value: "reimbursements", label: "Reimbursement" },
  { value: "pettycash", label: "Petty Cash" },
  { value: "tasks", label: "Manajemen Tugas" },
  { value: "finance", label: "Keuangan" },
  { value: "roles", label: "Role" },
  { value: "departments", label: "Departemen" },
  { value: "tenants", label: "Tenant" },
  { value: "auth", label: "Autentikasi" },
] as const;

export const ACTIVITY_LOG_ACTION_LABELS: Record<string, string> = {
  create: "Tambah",
  bulk_create: "Tambah Massal",
  update: "Ubah",
  delete: "Hapus",
  bulk_delete: "Hapus Massal",
  bulk_status: "Ubah Status Massal",
  approve: "Setujui",
  reject: "Tolak",
  import: "Import",
  login_success: "Login",
  login_failed: "Login Gagal",
  logout: "Logout",
};
