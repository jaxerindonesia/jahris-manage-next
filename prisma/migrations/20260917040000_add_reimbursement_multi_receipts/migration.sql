ALTER TABLE "reimbursement_details"
ADD COLUMN "receipt_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "reimbursement_details"
SET "receipt_urls" = ARRAY["receipt_url"]
WHERE "receipt_url" IS NOT NULL;
