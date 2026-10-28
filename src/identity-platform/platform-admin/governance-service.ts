import { createHash, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { ERRORS, IdentityError } from "../application/errors/IdentityError"
import { writeAuditLog } from "../infrastructure/postgres/audit-log-writer"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PlatformRole, PlatformStaffRepository } from "./staff-roles"

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

export interface AdminStaffMember {
  userId: string | null
  name: string | null
  email: string
  role: PlatformRole
  status: "active" | "disabled"
  // A PLATFORM_ADMIN_EMAILS Super Admin -- permanent, not editable from Madar Admin.
  isOwner: boolean
  addedAt: string | null
}

export interface AdminFeatureFlag {
  key: string
  description: string | null
  enabled: boolean
  // Of customers without an override, the share that get it (0-100); null = everyone.
  rolloutPercentage: number | null
  overrides: Array<{ organizationId: string; organizationName: string; enabled: boolean }>
  updatedAt: string | null
}

// Whether a customer falls inside a flag's rollout -- stable per (flag, customer), so the same
// customer keeps the same answer as long as the percentage doesn't change.
function inRollout(key: string, organizationId: string, percentage: number | null): boolean {
  if (percentage === null) return true
  const bucket =
    createHash("sha256").update(`${key}:${organizationId}`).digest().readUInt32BE(0) % 100
  return bucket < percentage
}

// Staff, the cross-customer activity log, and feature flags -- the "who can do what, who did
// what, and what's switched on" side of Madar Admin.
export class PlatformGovernanceService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly staff: PlatformStaffRepository,
    private readonly ownerEmails: string[]
  ) {}

  // ---- Staff ----

  async listStaff(): Promise<AdminStaffMember[]> {
    const users = await this.db.query<{ id: string; email: string; full_name: string | null }>(
      "SELECT id, email, full_name FROM users WHERE deleted_at IS NULL"
    )
    const byId = new Map(users.rows.map((row) => [row.id, row]))
    const byEmail = new Map(users.rows.map((row) => [row.email.toLowerCase(), row]))

    const owners: AdminStaffMember[] = this.ownerEmails.map((email) => {
      const user = byEmail.get(email.toLowerCase())
      return {
        userId: user?.id ?? null,
        name: user?.full_name ?? null,
        email,
        role: "super_admin",
        status: "active",
        isOwner: true,
        addedAt: null,
      }
    })
    const ownerIds = new Set(owners.map((owner) => owner.userId).filter(Boolean))
    const members = (await this.staff.list())
      .filter((entry) => !ownerIds.has(entry.userId))
      .map((entry): AdminStaffMember => {
        const user = byId.get(entry.userId)
        return {
          userId: entry.userId,
          name: user?.full_name ?? null,
          email: user?.email ?? "—",
          role: entry.role,
          status: entry.status,
          isOwner: false,
          addedAt: entry.createdAt,
        }
      })
      .sort((left, right) => (right.addedAt ?? "").localeCompare(left.addedAt ?? ""))
    return [...owners, ...members]
  }

  // Staff are existing Madar users -- they sign up like anyone else, then get a role here.
  async addStaff(actor: AuthenticatedActor, input: { email: string; role: PlatformRole }) {
    const email = input.email.trim().toLowerCase()
    if (this.ownerEmails.map((owner) => owner.toLowerCase()).includes(email)) {
      throw ERRORS.conflict("STAFF_IS_OWNER", "This person is already a permanent Super Admin.")
    }
    const user = await this.db.query<{ id: string }>(
      "SELECT id FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL",
      [email]
    )
    if (!user.rows[0]) {
      throw new IdentityError(
        "STAFF_USER_NOT_FOUND",
        404,
        "business",
        "No Madar account uses this email -- ask them to sign up first."
      )
    }
    const userId = user.rows[0].id
    const existing = await this.staff.findByUserId(userId)
    const now = new Date().toISOString()
    await this.staff.save({
      userId,
      role: input.role,
      status: "active",
      addedByUserId: actor.userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    await this.audit(actor, "platform_admin.staff_added", userId, { email, role: input.role })
  }

  async updateStaff(
    actor: AuthenticatedActor,
    userId: string,
    input: { role?: PlatformRole; status?: "active" | "disabled" }
  ) {
    const existing = await this.staff.findByUserId(userId)
    if (!existing) throw ERRORS.notFound("Staff member")
    if (
      userId === actor.userId &&
      (input.status === "disabled" || (input.role && input.role !== "super_admin"))
    ) {
      throw ERRORS.conflict("STAFF_SELF_LOCKOUT", "You can't remove your own access.")
    }
    await this.staff.save({
      ...existing,
      role: input.role ?? existing.role,
      status: input.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    })
    await this.audit(actor, "platform_admin.staff_updated", userId, { ...input })
  }

  // ---- Feature flags ----

  async listFlags(): Promise<AdminFeatureFlag[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM feature_flags ORDER BY flag_key"
    )
    const names = await this.db.query<{ id: string; name: string }>(
      "SELECT id, name FROM organizations"
    )
    const orgName = new Map(names.rows.map((row) => [row.id, row.name]))
    const flags = new Map<string, AdminFeatureFlag>()
    for (const row of rows.rows.filter((entry) => entry.scope_type === "global")) {
      flags.set(String(row.flag_key), {
        key: String(row.flag_key),
        description: (row.description as string | null) ?? null,
        enabled: row.enabled === true,
        rolloutPercentage:
          row.rollout_percentage === null || row.rollout_percentage === undefined
            ? null
            : Number(row.rollout_percentage),
        overrides: [],
        updatedAt: toIso(row.updated_at),
      })
    }
    for (const row of rows.rows.filter((entry) => entry.scope_type === "organization")) {
      const flag = flags.get(String(row.flag_key))
      if (!flag || !row.scope_id) continue
      flag.overrides.push({
        organizationId: String(row.scope_id),
        organizationName: orgName.get(String(row.scope_id)) ?? "—",
        enabled: row.enabled === true,
      })
    }
    return [...flags.values()]
  }

  async createFlag(
    actor: AuthenticatedActor,
    input: {
      key: string
      description: string | null
      enabled: boolean
      rolloutPercentage: number | null
    }
  ) {
    const existing = await this.db.query(
      "SELECT 1 FROM feature_flags WHERE flag_key = $1 AND scope_type = 'global'",
      [input.key]
    )
    if (existing.rows.length > 0) {
      throw ERRORS.conflict("FLAG_KEY_TAKEN", "A feature flag with this key already exists.")
    }
    await this.db.query(
      `INSERT INTO feature_flags (id, flag_key, scope_type, scope_id, enabled, rollout_percentage, description)
       VALUES ($1, $2, 'global', NULL, $3, $4, $5)`,
      [randomUUID(), input.key, input.enabled, input.rolloutPercentage, input.description]
    )
    await this.audit(actor, "platform_admin.flag_created", null, { ...input })
  }

  async updateFlag(
    actor: AuthenticatedActor,
    key: string,
    input: { description: string | null; enabled: boolean; rolloutPercentage: number | null }
  ) {
    const result = await this.db.query(
      `UPDATE feature_flags
          SET enabled = $2, rollout_percentage = $3, description = $4, updated_at = now()
        WHERE flag_key = $1 AND scope_type = 'global'`,
      [key, input.enabled, input.rolloutPercentage, input.description]
    )
    if ((result.rowCount ?? 0) === 0) throw ERRORS.notFound("Feature flag")
    await this.audit(actor, "platform_admin.flag_updated", null, { key, ...input })
  }

  async setFlagOverride(
    actor: AuthenticatedActor,
    key: string,
    organizationId: string,
    enabled: boolean | null
  ) {
    const global = await this.db.query(
      "SELECT 1 FROM feature_flags WHERE flag_key = $1 AND scope_type = 'global'",
      [key]
    )
    if (global.rows.length === 0) throw ERRORS.notFound("Feature flag")
    await this.db.query(
      "DELETE FROM feature_flags WHERE flag_key = $1 AND scope_type = 'organization' AND scope_id = $2",
      [key, organizationId]
    )
    if (enabled !== null) {
      await this.db.query(
        `INSERT INTO feature_flags (id, flag_key, scope_type, scope_id, enabled)
         VALUES ($1, $2, 'organization', $3, $4)`,
        [randomUUID(), key, organizationId, enabled]
      )
    }
    await this.audit(actor, "platform_admin.flag_override_set", null, {
      key,
      organizationId,
      enabled,
    })
  }

  async deleteFlag(actor: AuthenticatedActor, key: string) {
    await this.db.query("DELETE FROM feature_flags WHERE flag_key = $1", [key])
    await this.audit(actor, "platform_admin.flag_deleted", null, { key })
  }

  // What a customer gets: their own override if they have one, else the global switch narrowed
  // by the rollout percentage.
  async evaluateFlags(organizationId: string): Promise<Record<string, boolean>> {
    const flags = await this.listFlags()
    return Object.fromEntries(
      flags.map((flag) => {
        const override = flag.overrides.find((entry) => entry.organizationId === organizationId)
        if (override) return [flag.key, override.enabled]
        return [
          flag.key,
          flag.enabled && inRollout(flag.key, organizationId, flag.rolloutPercentage),
        ]
      })
    )
  }

  private async audit(
    actor: AuthenticatedActor,
    action: string,
    entityId: string | null,
    metadata: Record<string, unknown>
  ) {
    await writeAuditLog(this.db, {
      action,
      actorUserId: actor.userId,
      organizationId: null,
      workspaceId: null,
      entityType: "platform",
      entityId,
      metadata,
    })
  }
}
