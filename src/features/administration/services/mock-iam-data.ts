import type { IamPermissionGroup } from "../types"

// Static permission taxonomy (module -> selectable actions) used to build the Roles screen's
// permission matrix. This is real, hand-authored structure describing what the app can grant --
// not sample/demo data. Everything else that used to live in this file (IAM_USERS, IAM_TEAMS,
// IAM_INVITATIONS, IAM_ACTIVITY_LOGS, IAM_AUDIT_LOGS, IAM_SESSIONS, IAM_WORKSPACES) was fabricated
// fixture data with no real consumer anywhere in the app -- removed rather than kept as dead code.
//
// Ordered to match the main sidebar (src/components/app-sidebar.tsx) top to bottom. Several
// sidebar/settings pages share one real permission (e.g. القنوات + منشئ الروابط ride on
// campaigns:view, الفواتير + الورديات ride on pos:view) -- those pages are listed under the
// owning module in PERMISSION_MODULE_META's `pages`, not duplicated as separate rows with their
// own checkboxes.
export const IAM_PERMISSION_GROUPS: IamPermissionGroup[] = [
  { module: "dashboard", label: "Dashboard", actions: ["view", "export"] },
  { module: "liveVisitors", label: "Live Visitors", actions: ["view"] },
  {
    module: "campaigns",
    label: "Campaigns",
    actions: ["view", "create", "edit", "delete", "approve", "publish"],
  },
  {
    module: "connections",
    label: "Connections",
    actions: ["view", "create", "edit", "delete", "manage"],
  },
  { module: "stores", label: "Stores", actions: ["view"] },
  {
    module: "products",
    label: "Products",
    actions: ["view", "create", "edit", "delete", "export", "import"],
  },
  { module: "orders", label: "Orders", actions: ["view", "export"] },
  { module: "pos", label: "POS", actions: ["view", "manage"] },
  {
    module: "customers",
    label: "Customers",
    actions: ["view", "create", "edit", "delete", "export", "import"],
  },
  { module: "reports", label: "Reports", actions: ["view", "export", "approve"] },
  { module: "ai", label: "AI", actions: ["view", "manage"] },
  { module: "users", label: "Users", actions: ["view", "create", "edit", "delete", "manage"] },
  { module: "roles", label: "Roles", actions: ["view"] },
  { module: "teams", label: "Teams", actions: ["view"] },
  { module: "invitations", label: "Invitations", actions: ["view"] },
  { module: "auditLog", label: "Audit Log", actions: ["view"] },
  { module: "sessions", label: "Sessions", actions: ["view"] },
  { module: "settings", label: "Settings", actions: ["view", "edit", "manage"] },
  { module: "workspace", label: "Workspace", actions: ["view", "edit", "manage"] },
  { module: "tax", label: "Tax", actions: ["view", "manage"] },
]
