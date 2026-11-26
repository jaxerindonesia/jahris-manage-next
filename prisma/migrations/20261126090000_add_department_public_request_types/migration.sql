ALTER TABLE "departments"
ADD COLUMN IF NOT EXISTS "public_request_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
