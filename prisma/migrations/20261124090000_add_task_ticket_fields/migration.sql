ALTER TABLE "departments"
ADD COLUMN IF NOT EXISTS "code" TEXT;

ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "ticket_number" TEXT,
ADD COLUMN IF NOT EXISTS "priority" TEXT,
ADD COLUMN IF NOT EXISTS "requester" TEXT,
ADD COLUMN IF NOT EXISTS "support_pic" TEXT,
ADD COLUMN IF NOT EXISTS "objective" TEXT,
ADD COLUMN IF NOT EXISTS "scope" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_department_id_ticket_number_key" ON "tasks"("department_id", "ticket_number");
