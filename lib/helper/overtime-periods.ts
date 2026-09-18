import { getJakartaDayKey, getJakartaDayRange } from "@/lib/helper/date";

export function splitOvertimePeriods(startTime: Date, endTime: Date) {
  const start = startTime.getTime();
  const end = endTime.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Waktu selesai lembur harus setelah waktu mulai");
  }

  const periods = [];
  let cursor = start;
  let allocatedMinutes = 0;
  while (cursor < end) {
    const periodStart = new Date(cursor);
    const midnight = getJakartaDayRange(periodStart).endUtc.getTime() + 1;
    const periodEnd = Math.min(midnight, end);
    // Round cumulative duration so midnight does not discard an extra minute.
    const cumulativeMinutes = Math.floor((periodEnd - start) / 60000);
    periods.push({
      overtimeDate: getJakartaDayKey(periodStart),
      startTime: periodStart,
      endTime: new Date(periodEnd),
      overtimeMinutes: cumulativeMinutes - allocatedMinutes,
      requestedMinutes: cumulativeMinutes - allocatedMinutes,
    });
    allocatedMinutes = cumulativeMinutes;
    cursor = periodEnd;
  }
  return periods;
}
