import type { IamPermissionGroup } from "../types"

// Static permission taxonomy (module -> selectable actions) used to build the Roles screen's
// permission matrix. This is real, hand-authored structure describing what the app can grant --
// not sample/demo data. Everything else that used to live in this file (IAM_USERS, IAM_TEAMS,
// IAM_INVITATIONS, IAM_ACTIVITY_LOGS, IAM_AUDIT_LOGS, IAM_SESSIONS, IAM_WORKSPACES) was fabricated
// fixture data with no real consumer anywhere in the app -- removed rather than kept as dead code.
export const IAM_PERMISSION_GROUPS: IamPermissionGroup[] = [
  { module: "dashboard", label: "Dashboard", actions: ["view", "export"] },
  {
    module: "campaigns",
    label: "Campaigns",
    actions: ["view", "create", "edit", "delete", "approve", "publish"],
  },
  {
    module: "customers",
    label: "Customers",
    actions: ["view", "create", "edit", "delete", "export", "import"],
  },
  {
    module: "products",
    label: "Products",
    actions: ["view", "create", "edit", "delete", "export", "import"],
  },
  { module: "reports", label: "Reports", actions: ["view", "export", "approve"] },
  {
    module: "connections",
    label: "Connections",
    actions: ["view", "create", "edit", "delete", "manage"],
  },
  {
    module: "creativeLibrary",
    label: "Creative Library",
    actions: ["view", "create", "edit", "delete", "publish"],
  },
  { module: "ai", label: "AI", actions: ["view", "manage"] },
  { module: "settings", label: "Settings", actions: ["view", "edit", "manage"] },
  { module: "workspace", label: "Workspace", actions: ["view", "edit", "manage"] },
  { module: "users", label: "Users", actions: ["view", "create", "edit", "delete", "manage"] },
  { module: "billing", label: "Billing", actions: ["view", "edit", "manage"] },
  { module: "notifications", label: "Notifications", actions: ["view", "edit", "manage"] },
  { module: "api", label: "API", actions: ["view", "create", "delete", "manage"] },
]
