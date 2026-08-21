import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { PosEmployeeStatus, PosEmployeeView, PosRoleView } from "./types"

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

interface RoleRow {
  id: string
  organization_id: string
  name: string
  permissions: unknown
  employee_count: string | number
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function mapRole(row: RoleRow): PosRoleView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
    employeeCount: Number(row.employee_count) || 0,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

interface EmployeeRow {
  id: string
  organization_id: string
  full_name: string
  email: string
  status: string
  pos_role_id: string | null
  pos_role_name: string | null
  last_login_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function mapEmployee(row: EmployeeRow): PosEmployeeView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    email: row.email,
    status: row.status as PosEmployeeStatus,
    posRoleId: row.pos_role_id,
    posRoleName: row.pos_role_name,
    lastLoginAt: toIso(row.last_login_at),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

const ROLE_SELECT = `
  SELECT
    r.id, r.organization_id, r.name, r.permissions, r.created_at, r.updated_at,
    count(e.id) AS employee_count
  FROM pos_roles r
  LEFT JOIN pos_employees e ON e.pos_role_id = r.id AND e.deleted_at IS NULL
`

const EMPLOYEE_SELECT = `
  SELECT
    e.id, e.organization_id, e.full_name, e.email, e.status, e.pos_role_id, e.last_login_at,
    e.created_at, e.updated_at, r.name AS pos_role_name
  FROM pos_employees e
  LEFT JOIN pos_roles r ON r.id = e.pos_role_id AND r.deleted_at IS NULL
`

export interface PosEmployeeAuthRecord {
  id: string
  organizationId: string
  fullName: string
  email: string
  passwordHash: string
  status: PosEmployeeStatus
  posRoleId: string | null
  posRoleName: string | null
}

export interface PosEmployeeSessionRecord {
  id: string
  employeeId: string
  organizationId: string
  revokedAt: string | null
  expiresAt: string
}

export class PosRepository {
  constructor(private readonly db: PostgresDatabase) {}

  // ---- Roles ----

  async listRoles(organizationId: string): Promise<PosRoleView[]> {
    const result = await this.db.query<RoleRow>({
      name: "pos-list-roles",
      text: `
        ${ROLE_SELECT}
        WHERE r.organization_id = $1 AND r.deleted_at IS NULL
        GROUP BY r.id
        ORDER BY r.created_at DESC
      `,
      values: [organizationId],
    })
    return result.rows.map(mapRole)
  }

  async findRoleById(organizationId: string, roleId: string): Promise<PosRoleView | null> {
    const result = await this.db.query<RoleRow>({
      name: "pos-find-role",
      text: `
        ${ROLE_SELECT}
        WHERE r.organization_id = $1 AND r.id = $2 AND r.deleted_at IS NULL
        GROUP BY r.id
      `,
      values: [organizationId, roleId],
    })
    const row = result.rows[0]
    return row ? mapRole(row) : null
  }

  async roleNameExists(
    organizationId: string,
    name: string,
    excludeRoleId?: string
  ): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>({
      name: "pos-role-name-exists",
      text: `
        SELECT EXISTS(
          SELECT 1 FROM pos_roles
          WHERE organization_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL
            AND ($3::uuid IS NULL OR id != $3::uuid)
        ) AS exists
      `,
      values: [organizationId, name, excludeRoleId ?? null],
    })
    return Boolean(result.rows[0]?.exists)
  }

  async createRole(input: {
    organizationId: string
    name: string
    permissions: string[]
  }): Promise<PosRoleView> {
    const id = randomUUID()
    await this.db.query({
      name: "pos-create-role",
      text: `
        INSERT INTO pos_roles (id, organization_id, name, permissions)
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      values: [id, input.organizationId, input.name, JSON.stringify(input.permissions)],
    })
    return (await this.findRoleById(input.organizationId, id))!
  }

  async updateRole(input: {
    organizationId: string
    roleId: string
    name?: string
    permissions?: string[]
  }): Promise<PosRoleView | null> {
    const sets: string[] = ["updated_at = now()"]
    const values: unknown[] = [input.organizationId, input.roleId]

    if (input.name !== undefined) {
      values.push(input.name)
      sets.push(`name = $${values.length}`)
    }
    if (input.permissions !== undefined) {
      values.push(JSON.stringify(input.permissions))
      sets.push(`permissions = $${values.length}::jsonb`)
    }

    const result = await this.db.query({
      text: `
        UPDATE pos_roles
        SET ${sets.join(", ")}
        WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
        RETURNING id
      `,
      values,
    })
    if (result.rows.length === 0) return null
    return this.findRoleById(input.organizationId, input.roleId)
  }

  async countEmployeesByRole(organizationId: string, roleId: string): Promise<number> {
    const result = await this.db.query<{ cnt: string | number }>({
      name: "pos-count-employees-by-role",
      text: `
        SELECT count(*) AS cnt
        FROM pos_employees
        WHERE organization_id = $1 AND pos_role_id = $2 AND deleted_at IS NULL
      `,
      values: [organizationId, roleId],
    })
    return Number(result.rows[0]?.cnt ?? 0)
  }

  async deleteRole(organizationId: string, roleId: string): Promise<boolean> {
    const result = await this.db.query({
      name: "pos-delete-role",
      text: `
        UPDATE pos_roles
        SET deleted_at = now(), updated_at = now()
        WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
        RETURNING id
      `,
      values: [organizationId, roleId],
    })
    return result.rows.length > 0
  }

  // ---- Employees ----

  async listEmployees(organizationId: string): Promise<PosEmployeeView[]> {
    const result = await this.db.query<EmployeeRow>({
      name: "pos-list-employees",
      text: `
        ${EMPLOYEE_SELECT}
        WHERE e.organization_id = $1 AND e.deleted_at IS NULL
        ORDER BY e.created_at DESC
      `,
      values: [organizationId],
    })
    return result.rows.map(mapEmployee)
  }

  async findEmployeeById(
    organizationId: string,
    employeeId: string
  ): Promise<PosEmployeeView | null> {
    const result = await this.db.query<EmployeeRow>({
      name: "pos-find-employee",
      text: `
        ${EMPLOYEE_SELECT}
        WHERE e.organization_id = $1 AND e.id = $2 AND e.deleted_at IS NULL
      `,
      values: [organizationId, employeeId],
    })
    const row = result.rows[0]
    return row ? mapEmployee(row) : null
  }

  // Global, not org-scoped -- pos_employees.email is globally unique (see migration 032),
  // matching how the main `users` table already works so the login form only asks for
  // email + password, never which store/org first.
  async employeeEmailExists(email: string, excludeEmployeeId?: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>({
      name: "pos-employee-email-exists",
      text: `
        SELECT EXISTS(
          SELECT 1 FROM pos_employees
          WHERE lower(email) = lower($1) AND deleted_at IS NULL
            AND ($2::uuid IS NULL OR id != $2::uuid)
        ) AS exists
      `,
      values: [email, excludeEmployeeId ?? null],
    })
    return Boolean(result.rows[0]?.exists)
  }

  async createEmployee(input: {
    organizationId: string
    fullName: string
    email: string
    passwordHash: string
    posRoleId: string | null
  }): Promise<PosEmployeeView> {
    const id = randomUUID()
    await this.db.query({
      name: "pos-create-employee",
      text: `
        INSERT INTO pos_employees (id, organization_id, pos_role_id, full_name, email, password_hash, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'active')
      `,
      values: [
        id,
        input.organizationId,
        input.posRoleId,
        input.fullName,
        input.email,
        input.passwordHash,
      ],
    })
    return (await this.findEmployeeById(input.organizationId, id))!
  }

  async updateEmployee(input: {
    organizationId: string
    employeeId: string
    fullName?: string
    posRoleId?: string | null
    status?: PosEmployeeStatus
    passwordHash?: string
  }): Promise<PosEmployeeView | null> {
    const sets: string[] = ["updated_at = now()"]
    const values: unknown[] = [input.organizationId, input.employeeId]

    if (input.fullName !== undefined) {
      values.push(input.fullName)
      sets.push(`full_name = $${values.length}`)
    }
    if (input.posRoleId !== undefined) {
      values.push(input.posRoleId)
      sets.push(`pos_role_id = $${values.length}`)
    }
    if (input.status !== undefined) {
      values.push(input.status)
      sets.push(`status = $${values.length}`)
    }
    if (input.passwordHash !== undefined) {
      values.push(input.passwordHash)
      sets.push(`password_hash = $${values.length}`)
    }

    const result = await this.db.query({
      text: `
        UPDATE pos_employees
        SET ${sets.join(", ")}
        WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
        RETURNING id
      `,
      values,
    })
    if (result.rows.length === 0) return null
    return this.findEmployeeById(input.organizationId, input.employeeId)
  }

  // ---- Auth ----

  async findEmployeeAuthByEmail(email: string): Promise<PosEmployeeAuthRecord | null> {
    const result = await this.db.query<{
      id: string
      organization_id: string
      full_name: string
      email: string
      password_hash: string
      status: string
      pos_role_id: string | null
      pos_role_name: string | null
    }>({
      name: "pos-find-employee-auth-by-email",
      text: `
        SELECT e.id, e.organization_id, e.full_name, e.email, e.password_hash, e.status,
               e.pos_role_id, r.name AS pos_role_name
        FROM pos_employees e
        LEFT JOIN pos_roles r ON r.id = e.pos_role_id AND r.deleted_at IS NULL
        WHERE lower(e.email) = lower($1) AND e.deleted_at IS NULL
        LIMIT 1
      `,
      values: [email],
    })
    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      organizationId: row.organization_id,
      fullName: row.full_name,
      email: row.email,
      passwordHash: row.password_hash,
      status: row.status as PosEmployeeStatus,
      posRoleId: row.pos_role_id,
      posRoleName: row.pos_role_name,
    }
  }

  async touchLastLogin(employeeId: string): Promise<void> {
    await this.db.query({
      name: "pos-touch-last-login",
      text: `UPDATE pos_employees SET last_login_at = now() WHERE id = $1`,
      values: [employeeId],
    })
  }

  // ---- Sessions ----

  async createSession(input: {
    id: string
    employeeId: string
    organizationId: string
    expiresAt: string
  }): Promise<void> {
    await this.db.query({
      name: "pos-create-session",
      text: `
        INSERT INTO pos_employee_sessions (id, employee_id, organization_id, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      values: [input.id, input.employeeId, input.organizationId, input.expiresAt],
    })
  }

  async findSession(sessionId: string): Promise<PosEmployeeSessionRecord | null> {
    const result = await this.db.query<{
      id: string
      employee_id: string
      organization_id: string
      revoked_at: Date | string | null
      expires_at: Date | string
    }>({
      name: "pos-find-session",
      text: `
        SELECT id, employee_id, organization_id, revoked_at, expires_at
        FROM pos_employee_sessions
        WHERE id = $1
      `,
      values: [sessionId],
    })
    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      employeeId: row.employee_id,
      organizationId: row.organization_id,
      revokedAt: toIso(row.revoked_at),
      expiresAt: toIso(row.expires_at) ?? "",
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.query({
      name: "pos-revoke-session",
      text: `
        UPDATE pos_employee_sessions
        SET revoked_at = now()
        WHERE id = $1 AND revoked_at IS NULL
      `,
      values: [sessionId],
    })
  }

  async revokeAllSessionsForEmployee(employeeId: string): Promise<void> {
    await this.db.query({
      name: "pos-revoke-all-sessions-for-employee",
      text: `
        UPDATE pos_employee_sessions
        SET revoked_at = now()
        WHERE employee_id = $1 AND revoked_at IS NULL
      `,
      values: [employeeId],
    })
  }
}
