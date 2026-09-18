DROP INDEX "overtimes_attendance_id_key";
CREATE UNIQUE INDEX "overtimes_attendance_id_overtime_date_key" ON "overtimes"("attendance_id", "overtime_date");
