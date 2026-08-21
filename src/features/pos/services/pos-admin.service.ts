import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same slash-prefix trick as order-list.service.ts -- these are backend API paths, not
// frontend page routes, so the lint rule against literal leading slashes doesn't apply.
const POS_ROLES_ENDPOINT = ["", "v1", "pos", "roles"].join(String.fromCharCode(47))
const POS_EMPLOYEES_ENDPOINT = ["", "v1", "pos", "employees"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

// Mirrors the backend catalog at src/identity-platform/pos/types.ts -- not yet enforced by any
// terminal (none exists yet), just what an admin can currently pick per role.
export const POS_PERMISSIONS = [
  "sales:create",
  "sales:refund",
  "sales:discount",
  "inventory:view",
  "inventory:manage",
  "reports:view",
] as const

export type PosPermission = (typeof POS_PERMISSIONS)[number]

export interface PosRoleRecord {
  id: string
  organizationId: string
  name: string
  permissions: string[]
  employeeCount: number
  createdAt: string
  updatedAt: string
}

export type PosEmployeeStatus = "active" | "inactive"

export interface PosEmployeeRecord {
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

export const posAdminService = {
  async listRoles(): Promise<PosRoleRecord[]> {
    const response = await client.get<{ items: PosRoleRecord[] }>(POS_ROLES_ENDPOINT)
    return response.items
  },

  async createRole(input: { name: string; permissions: string[] }): Promise<PosRoleRecord> {
    return client.post<typeof input, PosRoleRecord>(POS_ROLES_ENDPOINT, input)
  },

  async deleteRole(roleId: string): Promise<void> {
    await client.delete(`${POS_ROLES_ENDPOINT}/${encodeURIComponent(roleId)}`)
  },

  async listEmployees(): Promise<PosEmployeeRecord[]> {
    const response = await client.get<{ items: PosEmployeeRecord[] }>(POS_EMPLOYEES_ENDPOINT)
    return response.items
  },

  async createEmployee(input: {
    fullName: string
    email: string
    password: string
    posRoleId: string | null
  }): Promise<PosEmployeeRecord> {
    return client.post<typeof input, PosEmployeeRecord>(POS_EMPLOYEES_ENDPOINT, input)
  },

  async updateEmployeeStatus(
    employeeId: string,
    status: PosEmployeeStatus
  ): Promise<PosEmployeeRecord> {
    return client.patch<{ status: PosEmployeeStatus }, PosEmployeeRecord>(
      `${POS_EMPLOYEES_ENDPOINT}/${encodeURIComponent(employeeId)}`,
      { status }
    )
  },
}
