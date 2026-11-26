const SENSITIVE_FIELDS = new Set([
  "password",
  "salt",
  "currentToken",
  "faceDescriptor",
  "updatedAt",
]);

export type ActivityLogChanges = Record<string, { from: unknown; to: unknown }>;

function normalizeValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return value ?? null;
}

export function pickActivityLogFields(record: Record<string, unknown> | null | undefined) {
  if (!record) return null;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !SENSITIVE_FIELDS.has(key))
      .map(([key, value]) => [key, normalizeValue(value)]),
  );
}

export function diffActivityLogFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ActivityLogChanges {
  const changes: ActivityLogChanges = {};

  for (const key of Object.keys(after)) {
    if (SENSITIVE_FIELDS.has(key)) continue;
    const from = normalizeValue(before[key]);
    const to = normalizeValue(after[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }

  return changes;
}
