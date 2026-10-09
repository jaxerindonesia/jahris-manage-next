UPDATE "plans"
SET
  "feature_permission" = CASE
    WHEN NOT ("feature_permission" ? 'users')
      THEN "feature_permission" || '["users"]'::jsonb
    ELSE "feature_permission"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE LOWER("name") = 'pro plan';
