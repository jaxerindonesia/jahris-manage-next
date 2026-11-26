ALTER TABLE "departments"
ADD COLUMN IF NOT EXISTS "public_request_key" TEXT,
ADD COLUMN IF NOT EXISTS "public_request_user_id" UUID;

ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "requester_email" TEXT,
ADD COLUMN IF NOT EXISTS "requester_phone" TEXT,
ADD COLUMN IF NOT EXISTS "requester_division" TEXT,
ADD COLUMN IF NOT EXISTS "request_type" TEXT,
ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE TABLE IF NOT EXISTS "tenant_mail_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL,
    "password_encrypted" TEXT NOT NULL,
    "from_name" TEXT,
    "from_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_mail_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_mail_configs_tenant_id_key" ON "tenant_mail_configs"("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_mail_configs_tenant_id_fkey') THEN
    ALTER TABLE "tenant_mail_configs"
    ADD CONSTRAINT "tenant_mail_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
