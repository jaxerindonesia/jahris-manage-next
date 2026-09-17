CREATE TABLE "reimbursement_details" (
    "id" UUID NOT NULL,
    "reimbursement_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "receipt_url" TEXT,
    CONSTRAINT "reimbursement_details_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reimbursement_details_reimbursement_id_position_key"
ON "reimbursement_details"("reimbursement_id", "position");

ALTER TABLE "reimbursement_details" ADD CONSTRAINT "reimbursement_details_reimbursement_id_fkey"
FOREIGN KEY ("reimbursement_id") REFERENCES "reimbursements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "reimbursement_details" ("id", "reimbursement_id", "position", "category", "amount", "date", "receipt_url")
SELECT "id", "id", 0, "category", "amount", "date", "receipt_url" FROM "reimbursements";
