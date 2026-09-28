import { getJakartaDayKey } from "@/lib/helper/date";

export function getLegacyCheckoutEnd(
  checkIn: Date,
  config: { officeStartTime: string; officeEndTime: string } | null,
): Date | null {
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!config || !validTime.test(config.officeStartTime) || !validTime.test(config.officeEndTime)) return null;
  const day = getJakartaDayKey(checkIn);
  const [hours, minutes] = config.officeEndTime.split(":").map(Number);
  // Overnight legacy records lack a reliable shift snapshot; do not guess.
  if (config.officeEndTime <= config.officeStartTime) return null;
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours - 7, minutes));
}
