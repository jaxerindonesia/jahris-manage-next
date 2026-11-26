export interface TenantMailConfigDto {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string | null;
  fromEmail: string;
  hasPassword: boolean;
}

export interface TaskPublicRequestSettingsDto {
  departmentId: string;
  enabled: boolean;
  token: string | null;
  mailConfig: TenantMailConfigDto | null;
}

export interface TaskPublicRequestFormDto {
  companyName: string;
  companyLogoUrl: string | null;
  departmentName: string;
  divisions: string[];
  requestTypes: string[];
  priorities: { value: string; label: string; hint: string }[];
  maxFiles: number;
}

export interface TaskPublicRequestResultDto {
  ticketNumber: string | null;
  emailSent: boolean;
}
