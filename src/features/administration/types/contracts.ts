export type IamStatus = "active" | "inactive" | "pending" | "suspended"

export type IamPermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "import"
  | "approve"
  | "publish"
  | "manage"

export type IamPermissionModule =
  | "dashboard"
  | "campaigns"
  | "customers"
  | "products"
  | "reports"
  | "connections"
  | "creativeLibrary"
  | "ai"
  | "settings"
  | "workspace"
  | "users"
  | "billing"
  | "notifications"
  | "api"

export interface IamPermissionGroup {
  module: IamPermissionModule
  label: string
  actions: IamPermissionAction[]
}

export interface IamRole {
  id: string
  name: string
  description: string
  userCount: number
  isDefault: boolean
  permissions: Record<IamPermissionModule, IamPermissionAction[]>
}

export interface IamUser {
  id: string
  fullName: string
  email: string
  department: string
  roleId: string
  workspaces: string[]
  status: IamStatus
  lastLogin: string
  mfaEnabled: boolean
  teams: string[]
  recentActivity: string[]
  devices: Array<{ name: string; browser: string; lastActive: string }>
}

export interface IamInvitation {
  id: string
  email: string
  roleId: string
  workspace: string
  department: string
  status: "pending" | "accepted" | "expired" | "canceled"
  expiresAt: string
  invitedAt: string
}

export interface IamTeam {
  id: string
  name: string
  manager: string
  members: number
  workspace: string
  description: string
  color: string
}

export interface IamLogEvent {
  id: string
  actor: string
  action: string
  target: string
  category: "activity" | "audit"
  createdAt: string
  severity?: "low" | "medium" | "high"
}

export interface IamSession {
  id: string
  browser: string
  device: string
  ip: string
  location: string
  loginTime: string
  lastActivity: string
  current: boolean
}
