type FeatureSource = { featurePermission: unknown; name: string } | null | undefined;

export function parsePlanFeatures(plan: FeatureSource) {
  if (!plan) return { planName: null, featurePermissions: null };
  return {
    planName: plan.name,
    featurePermissions: Array.isArray(plan.featurePermission)
      ? plan.featurePermission.map(String).filter(Boolean)
      : [],
  };
}

export function hasPlanFeature(featurePermissions: string[] | null, model: string) {
  if (featurePermissions === null) return true;
  if (featurePermissions.includes("*")) return true;
  return featurePermissions.includes(model);
}

type SupportingFeatureRule = {
  features: string[];
  actions?: string[];
};

const readActions = ["get-all", "get-by-id"];

const supportingFeatures: Record<string, SupportingFeatureRule[]> = {
  roles: [{ features: ["users"], actions: readActions }],
  departments: [{ features: ["users"] }],
  branches: [
    {
      features: ["users", "payrolls", "work-shifts", "shift-schedules"],
      actions: readActions,
    },
  ],
  users: [
    {
      features: [
        "submissions",
        "overtimes",
        "payrolls",
        "performances",
        "shift-schedules",
      ],
      actions: readActions,
    },
  ],
  "work-shifts": [
    { features: ["shift-schedules"], actions: readActions },
  ],
  submission_types: [{ features: ["submissions"] }],
  tenants: [{ features: ["dashboard"], actions: ["get-by-id"] }],
};

export function hasPlanPermission(
  featurePermissions: string[] | null,
  model: string,
  action: string,
) {
  if (hasPlanFeature(featurePermissions, model)) return true;
  return (supportingFeatures[model] ?? []).some(
    (rule) =>
      (!rule.actions || rule.actions.includes(action)) &&
      rule.features.some((feature) =>
        hasPlanFeature(featurePermissions, feature),
      ),
  );
}
