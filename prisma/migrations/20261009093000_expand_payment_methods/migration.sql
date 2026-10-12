DROP INDEX IF EXISTS "payment_methods_name_vendor_key";
ALTER TABLE "payment_methods" RENAME COLUMN "vendor" TO "provider";

ALTER TABLE "payment_methods"
ADD COLUMN "code" VARCHAR(50),
ADD COLUMN "description" TEXT,
ADD COLUMN "provider_code" VARCHAR(100),
ADD COLUMN "category" VARCHAR(50) NOT NULL DEFAULT 'other',
ADD COLUMN "fee_type" VARCHAR(20) NOT NULL DEFAULT 'fixed',
ADD COLUMN "fee_fixed" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN "fee_percentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN "fee_bearer" VARCHAR(20) NOT NULL DEFAULT 'customer',
ADD COLUMN "min_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN "max_amount" DECIMAL(15,2),
ADD COLUMN "icon_url" TEXT,
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "payment_methods" SET "code" = 'legacy_' || REPLACE("id"::text, '-', '') WHERE "code" IS NULL;
ALTER TABLE "payment_methods" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "payment_methods_code_key" ON "payment_methods"("code");
CREATE INDEX "payment_methods_category_is_active_sort_order_idx" ON "payment_methods"("category", "is_active", "sort_order");
