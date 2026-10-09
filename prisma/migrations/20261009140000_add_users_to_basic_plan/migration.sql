UPDATE "plans"
SET
  "feature_description" = CASE
    WHEN NOT ("feature_description" ? 'Data Karyawan')
      THEN "feature_description" || '["Data Karyawan"]'::jsonb
    ELSE "feature_description"
  END,
  "feature_permission" = CASE
    WHEN NOT ("feature_permission" ? 'users')
      THEN "feature_permission" || '["users"]'::jsonb
    ELSE "feature_permission"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE LOWER("name") = 'basic plan';
