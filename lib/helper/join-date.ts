export const MIN_JOIN_DATE = "1950-01-01";
export const JOIN_DATE_ERROR_MESSAGE =
  "Tanggal bergabung tidak valid. Gunakan tanggal antara 1950 hingga 1 tahun ke depan.";

export function getMaxJoinDate(now = new Date()) {
  const max = new Date(now);
  max.setFullYear(max.getFullYear() + 1);
  return max;
}

export function getMaxJoinDateInputValue(now = new Date()) {
  return getMaxJoinDate(now).toISOString().slice(0, 10);
}

export function parseJoinDate(value: unknown): Date | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && !(value instanceof Date)) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date < new Date(MIN_JOIN_DATE) || date > getMaxJoinDate()) return undefined;

  return date;
}
