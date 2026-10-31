import { randomBytes, randomUUID } from "node:crypto"

import type { Role } from "../types"
import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { Clock, EmailGateway, PasswordHasher } from "../application/ports"
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

import type { SallaAppStoreInstall, SallaOAuthService } from "./service"

// Unambiguous alphabet -- no 0/O/1/l/I -- since the merchant reads this password out of an email
// and types it, same as Zid's auto-provisioning.
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

function generateHumanPassword(length = 14) {
  const bytes = randomBytes(length)
  let password = ""
  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length]
  }
  return password
}

export interface SallaAutoProvisionDeps {
  users: UserRepository
  organizations: OrganizationRepository
  workspaces: WorkspaceRepository
  memberships: MembershipRepository
  hasher: PasswordHasher
  emailGateway: EmailGateway
  clock: Clock
  loginUrl: string
  // Starts the new connection syncing (every 30 minutes, the first run right away).
  scheduleSync: (input: {
    organizationId: string
    workspaceId: string | null
    userId: string
    connectionId: string
  }) => Promise<void>
  // A one-click sign-in link into this account and organization, opening the store's
  // connection -- the welcome e-mail's button. Optional: without it the button opens sign-in.
  createLoginLink?: (input: {
    userId: string
    organizationId: string
    connectionId: string
  }) => Promise<string>
}

export type SallaAutoProvisionOutcome = "created" | "linked" | "claim_required"

// A merchant pressed "install" on Madar in the Salla App Store: Salla sends app.store.authorize
// (server to server -- there is no browser to sign anyone in), and this finishes the job without
// the merchant ever visiting Madar first. A new email gets a Madar account (E-commerce app on,
// every sync component on) and a welcome email with its email, password and the Madar link; an
// email that already has an account gets the store linked to it instead, with no new password.
// Anything that stops either path leaves the install pending, claimable from Madar as before.
export class SallaMarketplaceAutoProvisionService {
  constructor(
    private readonly oauthService: SallaOAuthService,
    private readonly deps: SallaAutoProvisionDeps
  ) {}

  async provision(install: SallaAppStoreInstall): Promise<SallaAutoProvisionOutcome> {
    const email = install.merchantEmail?.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      console.log("salla.auto_provision_no_email", { storeName: install.storeName })
      return "claim_required"
    }

    try {
      const existing = await this.deps.users.findByEmail(email)
      const outcome = existing
        ? await this.linkToExistingAccount(install, existing.id, email)
        : await this.createAccount(install, email)
      console.log("salla.auto_provision_completed", { outcome, storeName: install.storeName })
      return outcome
    } catch (error) {
      console.error("salla.auto_provision_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
      return "claim_required"
    }
  }

  private async linkToExistingAccount(
    install: SallaAppStoreInstall,
    userId: string,
    email: string
  ): Promise<SallaAutoProvisionOutcome> {
    const membership = await this.deps.memberships.findFirstByUserId(userId)
    // Only someone who can manage the account's integrations gets a store attached to it.
    if (
      !membership ||
      membership.status !== "active" ||
      !(["owner", "admin"] as Role[]).includes(membership.role)
    ) {
      return "claim_required"
    }
    await this.enableEcommerce(membership.organizationId)
    const connection = await this.connect(install, {
      userId,
      sessionId: randomUUID(),
      organizationId: membership.organizationId,
      workspaceId: membership.workspaceId,
      roles: [membership.role],
      modulePermissions: [],
    })
    await this.sendWelcome({
      email,
      storeName: install.storeName,
      password: null,
      signInUrl: await this.loginLink(userId, connection),
    })
    return "linked"
  }

  private async createAccount(
    install: SallaAppStoreInstall,
    email: string
  ): Promise<SallaAutoProvisionOutcome> {
    const now = this.deps.clock.nowIso()
    const userId = randomUUID()
    const organizationId = randomUUID()
    const workspaceId = randomUUID()
    const password = generateHumanPassword()

    const user = UserEntity.register({
      id: userId,
      email,
      passwordHash: this.deps.hasher.hash(password),
      fullName: install.merchantName?.trim() || install.storeName,
      timezone: "Asia/Riyadh",
      language: "ar",
      organizationId,
      workspaceId,
      now,
    })
    // Salla's own install (an authenticated merchant's token) confirms the email -- without
    // this, the welcome email's password couldn't sign in until a separate verification.
    user.verifyEmail(now)
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
      id: randomUUID(),
      organizationId,
      workspaceId,
      userId,
      role: "owner" as Role,
      now,
    })

    // users and organizations reference each other: insert the user without those links, then
    // re-save it once the organization and workspace exist (same as register()).
    await this.deps.users.save({
      ...user.toState(),
      primaryOrganizationId: null,
      activeWorkspaceId: null,
    })
    await this.deps.organizations.save(organization.toState())
    await this.deps.workspaces.save(workspace.toState())
    await this.deps.users.save(user.toState())
    await this.deps.memberships.save(membership.toState())

    const connection = await this.connect(install, {
      userId,
      sessionId: randomUUID(),
      organizationId,
      workspaceId,
      roles: ["owner" as Role],
      modulePermissions: [],
    })
    await this.sendWelcome({
      email,
      storeName: install.storeName,
      password,
      signInUrl: await this.loginLink(userId, connection),
    })
    return "created"
  }

  private async enableEcommerce(organizationId: string) {
    const state = await this.deps.organizations.findById(organizationId)
    if (!state || state.settings.ecommerceEnabled === true) return
    const organization = OrganizationEntity.rehydrate(state)
    organization.update({ settings: { ecommerceEnabled: true } }, this.deps.clock.nowIso())
    await this.deps.organizations.save(organization.toState())
  }

  // Claims the pending install as this account (creating the Salla connection) and starts it
  // syncing. Sync components need no setup: a connection with none saved syncs everything.
  private async connect(install: SallaAppStoreInstall, actor: AuthenticatedActor) {
    const connection = await this.oauthService.claimMarketplaceInstall(actor, install.claimToken)
    await this.deps
      .scheduleSync({
        organizationId: connection.organizationId,
        workspaceId: connection.workspaceId,
        userId: actor.userId,
        connectionId: connection.connectionId,
      })
      .catch((error: unknown) => {
        console.error("salla.auto_provision_schedule_failed", { error })
      })
    return connection
  }

  // Best-effort like the e-mail itself: without a link, the button just opens sign-in.
  private async loginLink(
    userId: string,
    connection: { organizationId: string; connectionId: string }
  ): Promise<string | null> {
    if (!this.deps.createLoginLink) return null
    try {
      return await this.deps.createLoginLink({
        userId,
        organizationId: connection.organizationId,
        connectionId: connection.connectionId,
      })
    } catch (error) {
      console.error("salla.login_link_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  private async sendWelcome(input: {
    email: string
    storeName: string
    password: string | null
    signInUrl: string | null
  }) {
    // Best-effort: the account and connection already exist; "forgot password" still works.
    await this.deps.emailGateway
      .sendStoreWelcomeEmail({
        email: input.email,
        platformName: "سلة",
        storeName: input.storeName,
        loginUrl: this.deps.loginUrl,
        signInUrl: input.signInUrl,
        password: input.password,
      })
      .catch((error: unknown) => {
        console.error("salla.welcome_email_failed", {
          message: error instanceof Error ? error.message : String(error),
        })
      })
  }
}
