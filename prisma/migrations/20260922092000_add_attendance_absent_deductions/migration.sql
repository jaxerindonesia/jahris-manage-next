CREATE TABLE "attendance_absent_deductions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "attendance_absent_deductions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_absent_deductions_tenant_id_day_of_week_key" ON "attendance_absent_deductions"("tenant_id", "day_of_week");
ALTER TABLE "attendance_absent_deductions" ADD CONSTRAINT "attendance_absent_deductions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
