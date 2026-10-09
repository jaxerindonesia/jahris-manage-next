CREATE TYPE "PlanBillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');

CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "feature_description" JSONB NOT NULL,
    "feature_permission" JSONB NOT NULL,
    "price" INTEGER,
    "type" "PlanBillingCycle" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "payment_method_id" UUID,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "TenantSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_name_type_key" ON "plans"("name", "type");
CREATE UNIQUE INDEX "payment_methods_name_vendor_key" ON "payment_methods"("name", "vendor");
CREATE INDEX "tenant_subscriptions_tenant_id_idx" ON "tenant_subscriptions"("tenant_id");
CREATE INDEX "tenant_subscriptions_plan_id_idx" ON "tenant_subscriptions"("plan_id");
CREATE INDEX "tenant_subscriptions_payment_method_id_idx" ON "tenant_subscriptions"("payment_method_id");
CREATE INDEX "tenant_subscriptions_status_end_date_idx" ON "tenant_subscriptions"("status", "end_date");

ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "plans" ("id", "name", "description", "feature_description", "feature_permission", "price", "type", "is_active", "created_at", "updated_at") VALUES
('00000000-0000-4000-8000-000000000101', 'Basic Plan', 'Paket dasar untuk perusahaan berskala kecil hingga menengah.', '["Dashboard HR", "Data Karyawan", "Absensi & kehadiran", "Pengajuan cuti / izin", "Basic reporting", "Face Recognition"]'::jsonb, '["dashboard", "users", "attendances", "submissions", "basic-reporting", "face-recognition"]'::jsonb, 7499, 'MONTHLY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000102', 'Pro Plan', 'Paket lengkap untuk perusahaan yang sedang berkembang.', '["Semua fitur Basic", "Pengelolaan Keuangan", "Manajemen Tugas", "Penilaian Kinerja (KPI)", "Perhitungan Penggajian Otomatis"]'::jsonb, '["dashboard", "users", "attendances", "submissions", "basic-reporting", "face-recognition", "finance", "task-managements", "performances", "payrolls"]'::jsonb, 9999, 'MONTHLY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000103', 'Enterprise Plan', 'Paket khusus untuk perusahaan besar dan kebutuhan multi-cabang.', '["Semua fitur lengkap", "Face Recognition", "Custom integration", "Dedicated support / SLA"]'::jsonb, '["*"]'::jsonb, NULL, 'MONTHLY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
