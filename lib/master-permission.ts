export const MASTER_PERMISSIONS = [
  {
    model: "users",
    actions: ["get-all", "get-by-id", "create", "update", "delete", "export", "import"],
  },
  {
    model: "roles",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
  {
    model: "departments",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
  {
    model: "branches",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
  {
    model: "work-shifts",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
  {
    model: "shift-schedules",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
  {
    model: "submissions",
    actions: ["get-all", "get-by-id", "create", "update", "set-config", "delete", "export"],
  },
  {
    model: "submission_types",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
  {
    model: "attendances",
    actions: ["get-all", "get-by-id", "create", "update", "set-config", "delete", "export"],
  },
  {
    model: "task-managements",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
  {
    model: "payrolls",
    actions: ["get-all", "get-by-id", "create", "update", "set-config", "delete", "export"],
  },
  {
    model: "performances",
    actions: ["get-all", "get-by-id", "create", "update", "delete", "export"],
  },
  {
    model: "reimbursements",
    actions: ["get-all", "get-by-id", "create", "update", "approve", "delete", "export"],
  },
  {
    model: "overtimes",
    actions: ["get-all", "get-by-id", "create", "update", "set-config", "delete", "export"],
  },
  {
    model: "pettycash",
    actions: ["get-all", "get-by-id", "create", "update", "update-report", "delete", "export"],
  },
  {
    model: "finance",
    actions: ["get-all", "get-by-id", "create", "update", "delete", "export", "import"],
  },
  {
    model: "tenants",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
  {
    model: "tenant-subscriptions",
    actions: ["get-all", "get-by-id", "create", "update", "delete", "activate", "cancel", "renew"],
  },
  {
    model: "plans",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
  {
    model: "payment-methods",
    actions: ["get-all", "get-by-id", "create", "update", "delete"],
  },
];
