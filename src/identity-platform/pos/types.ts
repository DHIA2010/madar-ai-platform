// Free-form catalog, not yet enforced anywhere (no POS terminal exists to check against).
// Roles store whichever of these an admin picks so the terminal has something real to read
// once it's built, instead of inventing the list from scratch later.
export const POS_PERMISSIONS = [
  "sales:create",
  "sales:refund",
  "sales:discount",
  "inventory:view",
  "inventory:manage",
  "reports:view",
] as const

export type PosPermission = (typeof POS_PERMISSIONS)[number]

export interface PosRoleView {
  id: string
  organizationId: string
  name: string
  permissions: string[]
  employeeCount: number
  createdAt: string
  updatedAt: string
}

export type PosEmployeeStatus = "active" | "inactive"

export interface PosEmployeeView {
  id: string
  organizationId: string
  fullName: string
  email: string
  status: PosEmployeeStatus
  posRoleId: string | null
  posRoleName: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PosEmployeeActor {
  employeeId: string
  organizationId: string
  sessionId: string
}

export interface PosLoginResult {
  accessToken: string
  accessTokenExpiresAt: string
  employee: {
    id: string
    fullName: string
    email: string
    organizationId: string
    posRoleId: string | null
    posRoleName: string | null
  }
}
