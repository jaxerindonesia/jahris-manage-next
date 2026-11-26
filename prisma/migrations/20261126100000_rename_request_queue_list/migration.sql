UPDATE "task_lists"
SET "name" = 'Queue Request', "updated_at" = NOW()
WHERE LOWER("name") = 'antrian request';
