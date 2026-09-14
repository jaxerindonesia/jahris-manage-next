import type { AttendanceOvertimeDto } from "../dto/attendance-overtime";

export function getAttendanceOvertime(
  attendance: {
    id: string;
    checkIn: Date | null;
    checkOut: Date | null;
    scheduledEndAt: Date | null;
    autoCheckout: boolean;
  },
  thresholdHours: number,
): AttendanceOvertimeDto | null {
  if (!Number.isFinite(thresholdHours) || thresholdHours <= 0 || attendance.autoCheckout ||
    !attendance.checkIn || !attendance.checkOut || !attendance.scheduledEndAt) return null;
  const start = Math.max(attendance.scheduledEndAt.getTime(), attendance.checkIn.getTime());
  const end = attendance.checkOut.getTime();
  const overtimeMinutes = Math.floor((end - start) / 60000);
  if (!Number.isFinite(overtimeMinutes) || overtimeMinutes < Math.ceil(thresholdHours * 60)) return null;
  return { attendanceId: attendance.id, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), overtimeMinutes };
}
