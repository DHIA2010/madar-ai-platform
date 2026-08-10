import type {
  AddTeamMemberRequestDto,
  AdministrationInvitationDto,
  AdministrationRepository,
  AdministrationRoleDto,
  AdministrationSessionDto,
  AdministrationTeamDto,
  AdministrationTeamMemberDto,
  AdministrationUserDto,
  AdministrationUserStatus,
  AuditLogEventDto,
  AuditLogListDto,
  CancelInvitationRequestDto,
  CreateCustomRoleRequestDto,
  CreateTeamRequestDto,
  DeleteCustomRoleRequestDto,
  DeleteTeamRequestDto,
  GetAuditLogsRequestDto,
  GetInvitationsRequestDto,
  GetRolesRequestDto,
  GetTeamMembersRequestDto,
  GetTeamsRequestDto,
  GetUsersRequestDto,
  ReactivateMemberRequestDto,
  RemoveTeamMemberRequestDto,
  ResendInvitationRequestDto,
  RevokeSessionRequestDto,
  RolePermissionDto,
  SendInvitationRequestDto,
  SuspendMemberRequestDto,
  UpdateCustomRoleRequestDto,
  UpdateTeamRequestDto,
} from "@/application/contracts/administration.contracts"
import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"

import { mapRepositoryError } from "../errors"
import {
  AdministrationApiAdapter,
  type AuditLogsApiResponse,
  type CustomRoleApiEntry,
  type InvitationApiEntry,
  type OrganizationMemberApiEntry,
  type RoleApiEntry,
  type SessionApiEntry,
  type TeamApiEntry,
  type TeamMemberApiEntry,
} from "../adapters/administration-api.adapter"
import { createHttpDataClient } from "../api/http-data-client"
import { resolveAuthenticationApiBaseUrl } from "./repository-runtime"

const HIGH_SEVERITY_MARKERS = [
  "delete",
  "remove",
  "suspend",
  "revoke",
  "disconnect",
  "fail",
  "denied",
]
const LOW_SEVERITY_MARKERS = ["created", "restored", "connected", "accepted", "register", "verify"]

function humanizeAction(action: string) {
  return action.replace(/[._]/g, " ").trim()
}

function inferSeverity(action: string): AuditLogEventDto["severity"] {
  const normalized = action.toLowerCase()
  if (HIGH_SEVERITY_MARKERS.some((marker) => normalized.includes(marker))) {
    return "high"
  }
  if (LOW_SEVERITY_MARKERS.some((marker) => normalized.includes(marker))) {
    return "low"
  }
  return "medium"
}

function resolveTarget(entry: AuditLogsApiResponse["items"]["data"][number]) {
  const details = entry.details ?? {}
  const humanCandidate =
    (typeof details.email === "string" && details.email) ||
    (typeof details.name === "string" && details.name) ||
    (typeof details.workspaceName === "string" && details.workspaceName) ||
    null

  if (humanCandidate) {
    return humanCandidate
  }

  return entry.targetId ? `${entry.targetType}:${entry.targetId}` : entry.targetType
}

function mapAuditLogEntry(entry: AuditLogsApiResponse["items"]["data"][number]): AuditLogEventDto {
  return {
    id: entry.id,
    actor: entry.actorName ?? "System",
    action: humanizeAction(entry.action),
    target: resolveTarget(entry),
    category: "audit",
    createdAt: entry.createdAt,
    severity: inferSeverity(entry.action),
  }
}

const ROLE_PRIORITY = ["owner", "admin", "manager", "analyst", "viewer"]

function pickPrimaryRole(roles: string[]) {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) {
      return role
    }
  }
  return roles[0] ?? "viewer"
}

function pickAggregateStatus(
  statuses: OrganizationMemberApiEntry["status"][]
): AdministrationUserStatus {
  if (statuses.includes("active")) return "active"
  if (statuses.includes("invited")) return "pending"
  if (statuses.includes("suspended")) return "suspended"
  return "inactive"
}

function groupMembersIntoUsers(members: OrganizationMemberApiEntry[]): AdministrationUserDto[] {
  const byUserId = new Map<string, OrganizationMemberApiEntry[]>()
  for (const member of members) {
    const existing = byUserId.get(member.userId) ?? []
    existing.push(member)
    byUserId.set(member.userId, existing)
  }

  return Array.from(byUserId.entries()).map(([userId, rows]) => {
    const first = rows[0]
    const workspaces = Array.from(
      new Set(rows.map((row) => row.workspaceName).filter((name): name is string => Boolean(name)))
    )
    const lastLoginAt = rows
      .map((row) => row.lastLoginAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1)

    return {
      id: userId,
      fullName: first.fullName ?? first.email ?? "Unknown",
      email: first.email ?? "",
      avatarUrl: first.avatarUrl,
      department: "",
      roleId: pickPrimaryRole(rows.map((row) => row.role)),
      workspaces,
      status: pickAggregateStatus(rows.map((row) => row.status)),
      lastLogin: lastLoginAt ?? "",
      mfaEnabled: false,
      teams: Array.from(new Set(first.teams.map((team) => team.name))),
      recentActivity: [],
      devices: [],
    }
  })
}

const BROWSER_PATTERNS: Array<[RegExp, string]> = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
]

const DEVICE_PATTERNS: Array<[RegExp, string]> = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Macintosh/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
]

function parseUserAgent(userAgent: string) {
  const browser =
    BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "Unknown browser"
  const device =
    DEVICE_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "Unknown device"
  return { browser, device }
}

function mapSessionEntry(
  entry: SessionApiEntry,
  currentSessionId: string
): AdministrationSessionDto {
  const { browser, device } = parseUserAgent(entry.userAgent)
  return {
    id: entry.id,
    browser,
    device,
    ip: entry.ipAddress,
    location: "Unknown",
    loginTime: entry.createdAt,
    lastActivity: entry.updatedAt,
    current: entry.id === currentSessionId,
  }
}

function mapInvitationEntry(entry: InvitationApiEntry): AdministrationInvitationDto {
  return {
    id: entry.id,
    email: entry.email,
    roleId: entry.role,
    workspace: entry.workspaceName ?? "Organization-wide",
    department: "",
    status: entry.status,
    expiresAt: entry.expiresAt,
    invitedAt: entry.createdAt,
  }
}

const TEAM_COLOR_PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
]

function hashColorForId(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return TEAM_COLOR_PALETTE[hash % TEAM_COLOR_PALETTE.length]
}

function permissionsListToRecord(permissions: RolePermissionDto[]): Record<string, string[]> {
  const record: Record<string, string[]> = {}
  for (const permission of permissions) {
    const existing = record[permission.module] ?? []
    existing.push(permission.action)
    record[permission.module] = existing
  }
  return record
}

function mapTeamEntry(entry: TeamApiEntry): AdministrationTeamDto {
  return {
    id: entry.id,
    name: entry.name,
    manager: entry.managerName ?? "Unassigned",
    members: entry.memberCount,
    workspace: entry.workspaceName ?? "Organization-wide",
    workspaceId: entry.workspaceId,
    description: entry.description,
    color: hashColorForId(entry.id),
    roleReference: entry.roleReference,
    permissions: entry.permissions,
  }
}

function mapTeamMemberEntry(entry: TeamMemberApiEntry): AdministrationTeamMemberDto {
  return {
    id: entry.id,
    userId: entry.userId,
    fullName: entry.userFullName,
    email: entry.userEmail,
    addedAt: entry.createdAt,
  }
}

function mapRoleEntry(entry: RoleApiEntry): AdministrationRoleDto {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    userCount: entry.userCount,
    isDefault: entry.isDefault,
    editable: entry.editable,
    permissions: entry.permissions,
  }
}

function mapCustomRoleEntry(entry: CustomRoleApiEntry): AdministrationRoleDto {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    userCount: 0,
    isDefault: false,
    editable: true,
    permissions: permissionsListToRecord(entry.permissions),
  }
}

export class DataAdministrationRepository implements AdministrationRepository {
  private readonly adapter: AdministrationApiAdapter

  constructor(
    private readonly options?: {
      getSession?: () => AuthSessionDto | null
      getWorkspaceId?: () => string | null
    }
  ) {
    this.adapter = new AdministrationApiAdapter(
      createHttpDataClient({
        ...options,
        baseUrl: resolveAuthenticationApiBaseUrl(),
      })
    )
  }

  async getAuditLogs(request: GetAuditLogsRequestDto): Promise<AuditLogListDto> {
    try {
      const response = await this.adapter.getAuditLogs(request)
      return {
        page: response.page,
        pageSize: response.pageSize,
        total: response.total,
        items: response.data.map(mapAuditLogEntry),
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getUsers(request: GetUsersRequestDto): Promise<AdministrationUserDto[]> {
    try {
      const members = await this.adapter.getOrganizationMembers(request.organizationId)
      return groupMembersIntoUsers(members)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getInvitations(request: GetInvitationsRequestDto): Promise<AdministrationInvitationDto[]> {
    try {
      const items = await this.adapter.getOrganizationInvitations(request.organizationId)
      return items.map(mapInvitationEntry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async sendInvitation(request: SendInvitationRequestDto): Promise<AdministrationInvitationDto> {
    try {
      const entry = await this.adapter.sendInvitation(request)
      return mapInvitationEntry(entry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async cancelInvitation(request: CancelInvitationRequestDto): Promise<void> {
    try {
      await this.adapter.cancelInvitation(request)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async resendInvitation(
    request: ResendInvitationRequestDto
  ): Promise<AdministrationInvitationDto> {
    try {
      const entry = await this.adapter.resendInvitation(request)
      return mapInvitationEntry(entry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getSessions(): Promise<AdministrationSessionDto[]> {
    try {
      const response = await this.adapter.getCurrentSession()
      return response.sessions
        .map((entry) => mapSessionEntry(entry, response.currentSessionId))
        .sort((left, right) => (left.current === right.current ? 0 : left.current ? -1 : 1))
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async revokeSession(request: RevokeSessionRequestDto): Promise<void> {
    try {
      await this.adapter.revokeSession(request)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getTeams(request: GetTeamsRequestDto): Promise<AdministrationTeamDto[]> {
    try {
      const items = await this.adapter.getTeams(request.organizationId)
      return items.map(mapTeamEntry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async createTeam(request: CreateTeamRequestDto): Promise<AdministrationTeamDto> {
    try {
      const entry = await this.adapter.createTeam(request)
      return mapTeamEntry(entry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getTeamMembers(request: GetTeamMembersRequestDto): Promise<AdministrationTeamMemberDto[]> {
    try {
      const items = await this.adapter.getTeamMembers(request.teamId)
      return items.map(mapTeamMemberEntry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async addTeamMember(request: AddTeamMemberRequestDto): Promise<void> {
    try {
      await this.adapter.addTeamMember(request)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async removeTeamMember(request: RemoveTeamMemberRequestDto): Promise<void> {
    try {
      await this.adapter.removeTeamMember(request)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async updateTeam(request: UpdateTeamRequestDto): Promise<AdministrationTeamDto> {
    try {
      const entry = await this.adapter.updateTeam(request)
      return mapTeamEntry(entry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async deleteTeam(request: DeleteTeamRequestDto): Promise<void> {
    try {
      await this.adapter.deleteTeam(request)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getRoles(request: GetRolesRequestDto): Promise<AdministrationRoleDto[]> {
    try {
      const items = await this.adapter.getRoles(request.organizationId)
      return items.map(mapRoleEntry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async createCustomRole(request: CreateCustomRoleRequestDto): Promise<AdministrationRoleDto> {
    try {
      const entry = await this.adapter.createCustomRole(request)
      return mapCustomRoleEntry(entry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async updateCustomRole(request: UpdateCustomRoleRequestDto): Promise<AdministrationRoleDto> {
    try {
      const entry = await this.adapter.updateCustomRole(request)
      return mapCustomRoleEntry(entry)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async deleteCustomRole(request: DeleteCustomRoleRequestDto): Promise<void> {
    try {
      await this.adapter.deleteCustomRole(request)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async suspendMember(request: SuspendMemberRequestDto): Promise<void> {
    try {
      await this.adapter.suspendMember(request)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async reactivateMember(request: ReactivateMemberRequestDto): Promise<void> {
    try {
      await this.adapter.reactivateMember(request)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }
}

export function createAdministrationRepository(options?: {
  getSession?: () => AuthSessionDto | null
  getWorkspaceId?: () => string | null
}): AdministrationRepository {
  return new DataAdministrationRepository(options)
}
