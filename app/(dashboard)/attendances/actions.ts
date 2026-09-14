import { parseApiError } from "@/lib/helper/response-api";

export async function submitAttendanceOvertime(attendanceId: string, description: string, file: File) {
  const body = new FormData();
  body.set("attendanceId", attendanceId);
  body.set("description", description);
  body.set("file", file);
  const response = await fetch("/api/overtimes/request", { method: "POST", body });
  if (!response.ok) throw new Error(await parseApiError(response, "Gagal mengajukan lembur"));
  return response.json();
}
