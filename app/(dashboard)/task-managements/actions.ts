import { parseApiError } from "@/lib/helper/response-api";
import type { TaskPublicRequestSettingsDto } from "@/lib/dto/task-public-request";

const PUBLIC_REQUEST_ENDPOINT = "/api/task-managements/public-request";

export type TenantMailConfigForm = {
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

async function requestSettings(input: RequestInfo, init: RequestInit | undefined, fallback: string) {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(await parseApiError(res, fallback));
  const json = await res.json();
  return json.data as TaskPublicRequestSettingsDto;
}

export function fetchPublicRequestSettings(departmentId: string) {
  return requestSettings(
    `${PUBLIC_REQUEST_ENDPOINT}?departmentId=${encodeURIComponent(departmentId)}`,
    { cache: "no-store" },
    "Gagal memuat pengaturan link publik",
  );
}

export function generatePublicRequestLink(departmentId: string) {
  return requestSettings(
    PUBLIC_REQUEST_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId }),
    },
    "Gagal membuat link publik",
  );
}

export function disablePublicRequestLink(departmentId: string) {
  return requestSettings(
    `${PUBLIC_REQUEST_ENDPOINT}?departmentId=${encodeURIComponent(departmentId)}`,
    { method: "DELETE" },
    "Gagal menonaktifkan link publik",
  );
}

export function saveTenantMailConfig(departmentId: string, form: TenantMailConfigForm) {
  return requestSettings(
    PUBLIC_REQUEST_ENDPOINT,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, port: Number(form.port), departmentId }),
    },
    "Gagal menyimpan pengaturan email",
  );
}

export function savePublicRequestTypes(departmentId: string, requestTypes: string[]) {
  return requestSettings(
    PUBLIC_REQUEST_ENDPOINT,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, requestTypes }),
    },
    "Gagal menyimpan jenis request",
  );
}
