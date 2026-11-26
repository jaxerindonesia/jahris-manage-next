import type {
  TaskPublicRequestFormDto,
  TaskPublicRequestResultDto,
} from "@/lib/dto/task-public-request";
import type { PublicRequestForm } from "./types";

const endpoint = (token: string) => `/api/public/task-requests/${encodeURIComponent(token)}`;

async function readJson(response: Response, fallback: string) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.message || fallback);
  return json.data;
}

export async function fetchPublicRequestForm(token: string): Promise<TaskPublicRequestFormDto> {
  const response = await fetch(endpoint(token), { cache: "no-store" });
  return readJson(response, "Link request tidak valid");
}

export async function submitPublicRequest(
  token: string,
  form: PublicRequestForm,
  files: File[],
): Promise<TaskPublicRequestResultDto> {
  const formData = new FormData();
  Object.entries(form).forEach(([key, value]) => formData.append(key, value));
  files.forEach((file) => formData.append("files", file));

  const response = await fetch(endpoint(token), { method: "POST", body: formData });
  return readJson(response, "Gagal mengirim request");
}
