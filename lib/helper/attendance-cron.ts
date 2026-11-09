import { getJakartaDayKey } from "@/lib/helper/date";

export function getAttendanceCronDay(date: string | null, now = new Date()) {
  const today = getJakartaDayKey(now);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const day = date ? new Date(`${date}T00:00:00.000Z`) : yesterday;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date || day >= today)) {
    throw new Error("Tanggal cron harus tanggal valid sebelum hari ini (WIB)");
  }
  return day;
}
