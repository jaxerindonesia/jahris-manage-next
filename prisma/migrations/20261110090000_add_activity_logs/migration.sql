CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_name" TEXT,
    "actor_role" TEXT,
    "tenant_id" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "ip_address" TEXT,
    "method" TEXT,
    "path" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_logs_tenant_id_created_at_idx" ON "activity_logs"("tenant_id", "created_at");
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");
