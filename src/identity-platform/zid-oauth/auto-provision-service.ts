import { createHash, randomBytes, randomUUID } from "node:crypto"

import type { Role } from "../types"
import type {
  MembershipRepository,
  OrganizationRepository,
  UserRepository,
  WorkspaceRepository,
} from "../domain/repositories"
import {
  MembershipEntity,
  OrganizationEntity,
  UserEntity,
  WorkspaceEntity,
} from "../domain/entities"
import type { PasswordHasher, EmailGateway } from "../application/ports"
import { issueSessionForMember, type SessionIssuerDeps } from "../application/session-issuer"

import type { ZidOAuthService } from "./service"
import type { ZidOAuthRepository } from "./repository"

const HANDOFF_TTL_MS = 5 * 60 * 1000
// Unambiguous alphabet -- no 0/O/1/l/I -- since this is the one password a merchant might ever
// need to read out of an email and type by hand, unlike every other token in this module (all
// opaque, single-use, URL-embedded bearer credentials nobody reads).
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

function generateHumanPassword(length = 14) {
  const bytes = randomBytes(length)
  let password = ""
  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length]
  }
  return password
}

function createHandoffToken() {
  return `zdh_${randomBytes(24).toString("hex")}`
}

function hashHandoffToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export interface ZidAutoProvisionDeps extends SessionIssuerDeps {
  users: UserRepository
  organizations: OrganizationRepository
  workspaces: WorkspaceRepository
  memberships: MembershipRepository
  hasher: PasswordHasher
  emailGateway: EmailGateway
  loginUrl: string
}

export type ZidCompleteInstallResult =
  | { mode: "claim_required"; claimToken: string; storeName: string }
  | { mode: "auto_login"; handoffToken: string }

export class ZidMarketplaceAutoProvisionService {
  constructor(
    private readonly repository: ZidOAuthRepository,
    private readonly oauthService: ZidOAuthService,
    private readonly deps: ZidAutoProvisionDeps
  ) {}

  async completeInstall(input: { state: string; code: string }): Promise<ZidCompleteInstallResult> {
    const install = await this.oauthService.completeMarketplaceAuthorization({
      state: input.state,
      code: input.code,
    })

    const email = install.merchantEmail?.trim().toLowerCase()
    if (!email) {
      return {
        mode: "claim_required",
        claimToken: install.claimToken,
        storeName: install.storeName,
      }
    }

    const existingUser = await this.deps.users.findByEmail(email)
    if (existingUser) {
      // Deliberately unchanged from today's behavior -- Zid's own policy warns against silently
      // attaching a store to an existing account on an email match alone, so an email that
      // resolves to a real MADAR account always falls back to the normal claim/login flow, never
      // auto-login.
      return {
        mode: "claim_required",
        claimToken: install.claimToken,
        storeName: install.storeName,
      }
    }

    try {
      return await this.provisionNewMerchant(install, email)
    } catch (error) {
      // Auto-provisioning is an optimization on top of an already-working flow -- any failure in
      // it (a malformed email from Zid, a transient DB error, whatever) must degrade to the
      // always-safe claim-token path rather than losing the install entirely.
      console.error("zid_oauth.auto_provision_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
      return {
        mode: "claim_required",
        claimToken: install.claimToken,
        storeName: install.storeName,
      }
    }
  }

  private async provisionNewMerchant(
    install: {
      installId: string
      claimToken: string
      storeName: string
      merchantName: string | null
    },
    email: string
  ): Promise<ZidCompleteInstallResult> {
    const now = this.deps.clock.nowIso()
    const userId = randomUUID()
    const organizationId = randomUUID()
    const workspaceId = randomUUID()
    const membershipId = randomUUID()
    const password = generateHumanPassword()
    const fullName = install.merchantName?.trim() || install.storeName

    const user = UserEntity.register({
      id: userId,
      email,
      passwordHash: this.deps.hasher.hash(password),
      fullName,
      timezone: "Asia/Riyadh",
      language: "ar",
      organizationId,
      workspaceId,
      now,
    })
    // Zid's own OAuth handshake (plus, when true, its is_email_verified flag) is treated as
    // sufficient identity confirmation -- this also matters beyond today's auto-login: without
    // it, this merchant's future normal logins would be blocked by UserEntity.ensureCanLogin()'s
    // pending-verification gate, the same way register()'s plain signups are until they click
    // the verification email.
    user.verifyEmail(now)

    // Confirmed as a real failure in production (2026-10-04): with no settings passed, a
    // brand-new org starts with zero active applications -- app-sidebar.tsx's ANY_APPLICATION
    // gate then hides "Integrations" (and every other application-scoped nav item) entirely, so
    // a merchant who gets bounced off the direct zid_oauth=connected redirect (e.g. by a
    // workspace-selection interstitial) has no way back into the Zid setup wizard at all. This
    // org exists specifically because of a Zid (ecommerce) install, so there's no ambiguity about
    // which application it needs active -- activate it at creation time instead of leaving the
    // merchant to discover and flip the toggle themselves before they can even find the page.
    const organization = OrganizationEntity.create({
      id: organizationId,
      ownerUserId: userId,
      name: install.storeName,
      settings: { ecommerceEnabled: true },
      now,
    })
    const workspace = WorkspaceEntity.create({
      id: workspaceId,
      organizationId,
      name: `${install.storeName} - Default`,
      now,
    })
    const membership = MembershipEntity.create({
      id: membershipId,
      organizationId,
      workspaceId,
      userId,
      role: "owner" as Role,
      now,
    })

    // Same FK-circularity dance register() uses: users.primary_organization_id and
    // organizations.owner_user_id reference each other, so the user is inserted once with those
    // nulled out, then re-saved once the organization/workspace it points to actually exist.
    await this.deps.users.save({
      ...user.toState(),
      primaryOrganizationId: null,
      activeWorkspaceId: null,
    })
    await this.deps.organizations.save(organization.toState())
    await this.deps.workspaces.save(workspace.toState())
    await this.deps.users.save(user.toState())
    await this.deps.memberships.save(membership.toState())

    const actor = {
      userId,
      sessionId: randomUUID(),
      organizationId,
      workspaceId,
      roles: ["owner" as Role],
      modulePermissions: [],
    }
    await this.oauthService.claimInstall(actor, install.claimToken)

    const handoffToken = createHandoffToken()
    await this.repository.setAutoLoginHandoff({
      installId: install.installId,
      tokenHash: hashHandoffToken(handoffToken),
      expiresAt: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
      userId,
    })

    try {
      await this.deps.emailGateway.sendZidWelcomeEmail({
        email,
        password,
        loginUrl: this.deps.loginUrl,
        storeName: install.storeName,
      })
    } catch (error) {
      // Best-effort, unlike register()'s verification email -- the merchant is about to be
      // signed in regardless of whether this send succeeds, and can always use "forgot password"
      // later, so a flaky email provider must not undo an otherwise-successful auto-login.
      console.error("zid_oauth.welcome_email_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }

    return { mode: "auto_login", handoffToken }
  }

  async consumeAutoLogin(
    token: string,
    context: { ipAddress: string; userAgent: string }
  ): Promise<
    | {
        status: "ok"
        result: Awaited<ReturnType<typeof issueSessionForMember>>
        redirectUrl: string
      }
    | { status: "invalid" }
  > {
    const row = await this.repository.findMarketplaceInstallByAutoLoginTokenHash(
      hashHandoffToken(token)
    )
    if (!row) {
      return { status: "invalid" }
    }

    const expiresAt = new Date(String(row.auto_login_expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      return { status: "invalid" }
    }

    const userId = row.auto_provisioned_user_id as string | null
    if (!userId) {
      return { status: "invalid" }
    }

    // Single-use: consumed before the user/membership lookups even run, so a replayed or
    // concurrently-raced request can never mint a second session from the same token.
    const consumed = await this.repository.consumeAutoLoginHandoff(String(row.id))
    if (!consumed) {
      return { status: "invalid" }
    }

    const userState = await this.deps.users.findById(userId)
    if (!userState) {
      return { status: "invalid" }
    }
    const membership = await this.deps.memberships.findFirstByUserId(userId)
    if (!membership || membership.status !== "active") {
      return { status: "invalid" }
    }

    const now = this.deps.clock.nowIso()
    const result = await issueSessionForMember({
      user: {
        id: userState.id,
        email: userState.email,
        fullName: userState.fullName,
        avatarUrl: userState.avatarUrl,
        timezone: userState.timezone,
        language: userState.language,
        status: userState.status,
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
      now,
      deps: this.deps,
    })

    const connection = row.claimed_connection_id
      ? await this.repository.findConnectionById(String(row.claimed_connection_id))
      : null

    return {
      status: "ok",
      result,
      redirectUrl: connection
        ? this.oauthService.buildSuccessRedirect({
            connectionId: connection.id,
            projectId: connection.projectId,
            workspaceId: connection.workspaceId,
            organizationId: connection.organizationId,
            accountName:
              connection.providerAccountName ??
              (row.zid_store_name as string | null) ??
              "Zid Store",
            accountEmail: connection.providerAccountEmail,
            connectedAt: connection.lastConnectedAt ?? now,
            status: "connected",
          })
        : this.oauthService.buildErrorRedirect("auto_login_connection_missing"),
    }
  }
}
