import type { Role } from "../../types"

// Fixed, non-editable default permission matrices for the platform's real
// membership roles -- unlike custom roles, these are not backed by
// custom_role_permissions and don't affect actual authorization checks (those
// still run on the fixed owner/admin/manager/analyst/viewer role system).
// This just gives the granular Roles UI (and team role assignment) something
// honest to display and reference for the roles a member can actually be
// assigned.
export const SYSTEM_ROLE_DEFINITIONS: Array<{
  role: Role
  name: string
  description: string
  permissions: Record<string, string[]>
}> = [
  {
    role: "owner",
    name: "Owner",
    description: "Full control across security, billing, and workspace governance.",
    permissions: {
      dashboard: ["view", "export"],
      campaigns: ["view", "create", "edit", "delete", "approve", "publish"],
      customers: ["view", "create", "edit", "delete", "export", "import"],
      products: ["view", "create", "edit", "delete", "export", "import"],
      reports: ["view", "export", "approve"],
      connections: ["view", "create", "edit", "delete", "manage"],
      creativeLibrary: ["view", "create", "edit", "delete", "publish"],
      ai: ["view", "manage"],
      settings: ["view", "edit", "manage"],
      workspace: ["view", "edit", "manage"],
      users: ["view", "create", "edit", "delete", "manage"],
      billing: ["view", "edit", "manage"],
      notifications: ["view", "edit", "manage"],
      api: ["view", "create", "delete", "manage"],
    },
  },
  {
    role: "admin",
    name: "Admin",
    description: "Manages users, roles, and operational settings.",
    permissions: {
      dashboard: ["view"],
      campaigns: ["view", "create", "edit", "delete", "approve", "publish"],
      customers: ["view"],
      products: ["view"],
      reports: ["view"],
      connections: ["view"],
      creativeLibrary: ["view"],
      ai: ["view"],
      settings: ["view", "edit", "manage"],
      workspace: ["view", "edit", "manage"],
      users: ["view", "create", "edit", "delete", "manage"],
      billing: ["view"],
      notifications: ["view"],
      api: ["view"],
    },
  },
  {
    role: "manager",
    name: "Manager",
    description: "Owns campaign planning, approvals, and reporting.",
    permissions: {
      dashboard: ["view"],
      campaigns: ["view", "create", "edit", "approve", "publish"],
      customers: ["view"],
      products: ["view"],
      reports: ["view", "export"],
      connections: ["view"],
      creativeLibrary: ["view", "create", "edit", "publish"],
      ai: ["view"],
      settings: ["view"],
      workspace: ["view"],
      users: ["view"],
      billing: ["view"],
      notifications: ["view"],
      api: ["view"],
    },
  },
  {
    role: "analyst",
    name: "Analyst",
    description: "Analyzes KPI trends and exports reporting data.",
    permissions: {
      dashboard: ["view", "export"],
      campaigns: ["view"],
      customers: ["view"],
      products: ["view"],
      reports: ["view", "export"],
      connections: ["view"],
      creativeLibrary: ["view"],
      ai: ["view"],
      settings: ["view"],
      workspace: ["view"],
      users: ["view"],
      billing: ["view"],
      notifications: ["view"],
      api: ["view"],
    },
  },
  {
    role: "viewer",
    name: "Viewer",
    description: "Read-only access across approved modules.",
    permissions: {
      dashboard: ["view"],
      campaigns: ["view"],
      customers: ["view"],
      products: ["view"],
      reports: ["view"],
      connections: ["view"],
      creativeLibrary: ["view"],
      ai: ["view"],
      settings: ["view"],
      workspace: ["view"],
      users: ["view"],
      billing: ["view"],
      notifications: ["view"],
      api: ["view"],
    },
  },
]
