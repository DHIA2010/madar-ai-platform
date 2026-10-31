import { createHash, randomBytes, randomUUID } from "node:crypto"

import type { MembershipRepository, UserRepository } from "../domain/repositories"
import { issueSessionForMember, type SessionIssuerDeps } from "../application/session-issuer"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export interface LoginLinkDeps extends SessionIssuerDeps {
  users: UserRepository
  memberships: MembershipRepository
}

// One-click sign-in links for accounts Madar set up on a merchant's behalf (Salla App Store
// installs): the link signs that account in, in the store's organization, and lands on
// redirectPath. Reusable until it expires -- the same e-mail already carries the password, so a
// second click is no riskier than retyping it, and a merchant re-opening the e-mail isn't stranded.
export class LoginLinkService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly deps: LoginLinkDeps,
    private readonly appUrl: string
  ) {}

  // Returns the full URL to put in the e-mail.
  async create(input: {
    userId: string
    organizationId: string
    redirectPath: string
  }): Promise<string> {
    const token = `mll_${randomBytes(24).toString("hex")}`
    await this.db.query(
      `INSERT INTO account_login_links
         (id, token_hash, user_id, organization_id, redirect_path, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        hashToken(token),
        input.userId,
        input.organizationId,
        input.redirectPath,
        new Date(Date.now() + LINK_TTL_MS).toISOString(),
      ]
    )
    return `${this.appUrl.replace(/\/$/, "")}/login-link/${token}`
  }

  async consume(
    token: string,
    context: { ipAddress: string; userAgent: string }
  ): Promise<
    | {
        status: "ok"
        result: Awaited<ReturnType<typeof issueSessionForMember>>
        redirectPath: string
      }
    | { status: "invalid" }
  > {
    const link = await this.db.query<{
      id: string
      user_id: string
      organization_id: string
      redirect_path: string
      expires_at: string | Date
    }>(
      `SELECT id, user_id, organization_id, redirect_path, expires_at
         FROM account_login_links WHERE token_hash = $1`,
      [hashToken(token)]
    )
    const row = link.rows[0]
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
      return { status: "invalid" }
    }

    const user = await this.deps.users.findById(row.user_id)
    const membership = await this.deps.memberships.findByUserAndOrganization(
      row.user_id,
      row.organization_id
    )
    if (!user || !membership || membership.status !== "active") {
      return { status: "invalid" }
    }

    const result = await issueSessionForMember({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        language: user.language,
        status: user.status,
      },
      membership: {
        organizationId: membership.organizationId,
        workspaceId: membership.workspaceId,
        role: membership.role,
        customRoleId: membership.customRoleId,
        moduleAccessRevoked: membership.moduleAccessRevoked,
      },
      context,
      rememberMe: true,
      now: this.deps.clock.nowIso(),
      deps: this.deps,
    })
    await this.db.query("UPDATE account_login_links SET last_used_at = now() WHERE id = $1", [
      row.id,
    ])
    return { status: "ok", result, redirectPath: row.redirect_path }
  }
}
