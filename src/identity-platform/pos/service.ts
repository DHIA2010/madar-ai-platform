import { randomUUID } from "node:crypto"

import type { PasswordHasher, TokenService } from "../application/ports"
import { IdentityError } from "../application/errors/IdentityError"

import type { PosRepository } from "./repository"
import {
  type PosEmployeeActor,
  type PosEmployeeStatus,
  type PosEmployeeView,
  type PosLoginResult,
  type PosPermission,
  type PosRoleView,
  POS_PERMISSIONS,
} from "./types"

// One shift, no refresh-token flow -- deliberately simple per the explicit "simple login" ask.
// An employee just logs back in at the start of their next shift; deactivating an employee or
// logging out revokes the session immediately regardless of this TTL.
const SESSION_TTL_SECONDS = 60 * 60 * 12

const POS_ERRORS = {
  invalidCredentials: () =>
    new IdentityError(
      "POS_AUTH_INVALID_CREDENTIALS",
      401,
      "security",
      "Invalid email or password."
    ),
  employeeInactive: () =>
    new IdentityError(
      "POS_EMPLOYEE_INACTIVE",
      403,
      "security",
      "This employee account is inactive."
    ),
  tokenInvalid: () =>
    new IdentityError("POS_AUTH_TOKEN_INVALID", 401, "security", "Session is invalid or expired."),
  roleNameExists: () =>
    new IdentityError(
      "POS_ROLE_NAME_EXISTS",
      409,
      "business",
      "A role with this name already exists."
    ),
  roleNotFound: () => new IdentityError("POS_ROLE_NOT_FOUND", 404, "business", "Role not found."),
  roleInUse: (employeeCount: number) =>
    new IdentityError(
      "POS_ROLE_IN_USE",
      409,
      "business",
      "This role is assigned to employees and can't be deleted.",
      { employeeCount }
    ),
  invalidPermission: (permission: string) =>
    new IdentityError(
      "POS_INVALID_PERMISSION",
      422,
      "validation",
      `Unknown permission: ${permission}`
    ),
  employeeEmailExists: () =>
    new IdentityError(
      "POS_EMPLOYEE_EMAIL_EXISTS",
      409,
      "business",
      "An employee with this email already exists."
    ),
  employeeNotFound: () =>
    new IdentityError("POS_EMPLOYEE_NOT_FOUND", 404, "business", "Employee not found."),
}

function assertValidPermissions(permissions: string[]) {
  const invalid = permissions.find(
    (permission) => !POS_PERMISSIONS.includes(permission as PosPermission)
  )
  if (invalid) {
    throw POS_ERRORS.invalidPermission(invalid)
  }
}

export class PosService {
  constructor(
    private readonly repository: PosRepository,
    private readonly tokenService: TokenService,
    private readonly hasher: PasswordHasher
  ) {}

  // ---- Employee auth ----

  async login(input: { email: string; password: string }): Promise<PosLoginResult> {
    const record = await this.repository.findEmployeeAuthByEmail(input.email)
    if (!record || !this.hasher.verify(input.password, record.passwordHash)) {
      throw POS_ERRORS.invalidCredentials()
    }
    if (record.status !== "active") {
      throw POS_ERRORS.employeeInactive()
    }

    const sessionId = randomUUID()
    const nowSeconds = Math.floor(Date.now() / 1000)
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()

    await this.repository.createSession({
      id: sessionId,
      employeeId: record.id,
      organizationId: record.organizationId,
      expiresAt,
    })
    await this.repository.touchLastLogin(record.id)

    const accessToken = this.tokenService.signAccessToken({
      sub: record.id,
      sid: sessionId,
      org: record.organizationId,
      typ: "access",
      iat: nowSeconds,
      exp: nowSeconds + SESSION_TTL_SECONDS,
      jti: randomUUID(),
    })

    return {
      accessToken,
      accessTokenExpiresAt: expiresAt,
      employee: {
        id: record.id,
        fullName: record.fullName,
        email: record.email,
        organizationId: record.organizationId,
        posRoleId: record.posRoleId,
        posRoleName: record.posRoleName,
      },
    }
  }

  async resolveActor(accessToken: string): Promise<PosEmployeeActor> {
    const payload = this.tokenService.verifyAccessToken(accessToken)
    if (!payload || payload.typ !== "access") {
      throw POS_ERRORS.tokenInvalid()
    }
    const session = await this.repository.findSession(payload.sid)
    if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw POS_ERRORS.tokenInvalid()
    }
    return {
      employeeId: session.employeeId,
      organizationId: session.organizationId,
      sessionId: session.id,
    }
  }

  async logout(sessionId: string): Promise<void> {
    await this.repository.revokeSession(sessionId)
  }

  async getEmployee(organizationId: string, employeeId: string): Promise<PosEmployeeView | null> {
    return this.repository.findEmployeeById(organizationId, employeeId)
  }

  // ---- Admin: roles ----

  async listRoles(organizationId: string): Promise<PosRoleView[]> {
    return this.repository.listRoles(organizationId)
  }

  async createRole(
    organizationId: string,
    input: { name: string; permissions: string[] }
  ): Promise<PosRoleView> {
    assertValidPermissions(input.permissions)
    if (await this.repository.roleNameExists(organizationId, input.name)) {
      throw POS_ERRORS.roleNameExists()
    }
    return this.repository.createRole({
      organizationId,
      name: input.name,
      permissions: input.permissions,
    })
  }

  async updateRole(
    organizationId: string,
    roleId: string,
    input: { name?: string; permissions?: string[] }
  ): Promise<PosRoleView> {
    if (input.permissions) {
      assertValidPermissions(input.permissions)
    }
    if (input.name && (await this.repository.roleNameExists(organizationId, input.name, roleId))) {
      throw POS_ERRORS.roleNameExists()
    }
    const updated = await this.repository.updateRole({
      organizationId,
      roleId,
      name: input.name,
      permissions: input.permissions,
    })
    if (!updated) {
      throw POS_ERRORS.roleNotFound()
    }
    return updated
  }

  async deleteRole(organizationId: string, roleId: string): Promise<void> {
    const employeeCount = await this.repository.countEmployeesByRole(organizationId, roleId)
    if (employeeCount > 0) {
      throw POS_ERRORS.roleInUse(employeeCount)
    }
    const deleted = await this.repository.deleteRole(organizationId, roleId)
    if (!deleted) {
      throw POS_ERRORS.roleNotFound()
    }
  }

  // ---- Admin: employees ----

  async listEmployees(organizationId: string): Promise<PosEmployeeView[]> {
    return this.repository.listEmployees(organizationId)
  }

  async createEmployee(
    organizationId: string,
    input: { fullName: string; email: string; password: string; posRoleId: string | null }
  ): Promise<PosEmployeeView> {
    if (input.posRoleId && !(await this.repository.findRoleById(organizationId, input.posRoleId))) {
      throw POS_ERRORS.roleNotFound()
    }
    if (await this.repository.employeeEmailExists(input.email)) {
      throw POS_ERRORS.employeeEmailExists()
    }
    return this.repository.createEmployee({
      organizationId,
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      passwordHash: this.hasher.hash(input.password),
      posRoleId: input.posRoleId,
    })
  }

  async updateEmployee(
    organizationId: string,
    employeeId: string,
    input: {
      fullName?: string
      posRoleId?: string | null
      status?: PosEmployeeStatus
      password?: string
    }
  ): Promise<PosEmployeeView> {
    if (input.posRoleId && !(await this.repository.findRoleById(organizationId, input.posRoleId))) {
      throw POS_ERRORS.roleNotFound()
    }
    const updated = await this.repository.updateEmployee({
      organizationId,
      employeeId,
      fullName: input.fullName,
      posRoleId: input.posRoleId,
      status: input.status,
      passwordHash: input.password ? this.hasher.hash(input.password) : undefined,
    })
    if (!updated) {
      throw POS_ERRORS.employeeNotFound()
    }
    if (input.status === "inactive") {
      await this.repository.revokeAllSessionsForEmployee(employeeId)
    }
    return updated
  }
}
