// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import type { InMemoryEmailGateway } from "../infrastructure/email/in-memory-email-gateway"
import {
  SallaMarketplaceAutoProvisionService,
  type SallaAutoProvisionDeps,
} from "../salla-oauth/auto-provision-service"
import type { SallaOAuthService } from "../salla-oauth/service"

// A Salla App Store install finishing on its own: the account (or an existing one), the
// E-commerce app, the store connection and its sync schedule, and the welcome email.
let container: ReturnType<typeof createIdentityPlatform>
let claim: ReturnType<typeof vi.fn>
let scheduleSync: ReturnType<typeof vi.fn<SallaAutoProvisionDeps["scheduleSync"]>>
let service: SallaMarketplaceAutoProvisionService

const install = {
  claimToken: "claim-token-1",
  storeName: "متجر النخبة",
  merchantEmail: "Owner@Store.test",
  merchantName: "Sara Ahmed",
}

beforeEach(() => {
  container = createIdentityPlatform({ mode: "memory" })
  claim = vi.fn(async (actor: { organizationId: string; workspaceId: string | null }) => ({
    connectionId: "connection-1",
    organizationId: actor.organizationId,
    workspaceId: actor.workspaceId,
  }))
  scheduleSync = vi.fn<SallaAutoProvisionDeps["scheduleSync"]>(async () => {})
  service = new SallaMarketplaceAutoProvisionService(
    { claimMarketplaceInstall: claim } as unknown as SallaOAuthService,
    {
      ...(container.zidAutoProvisionDeps as Omit<
        SallaAutoProvisionDeps,
        "loginUrl" | "scheduleSync"
      >),
      loginUrl: "https://app.madar.test/auth/basic/login",
      scheduleSync,
      createLoginLink: async (input) =>
        `https://app.madar.test/login-link/for-${input.userId}-${input.connectionId}`,
    }
  )
})

function sentEmails() {
  const gateway = container.zidAutoProvisionDeps!.emailGateway as InMemoryEmailGateway
  return gateway.sent.filter((email) => email.kind === "store_welcome")
}

describe("Salla App Store auto-provisioning", () => {
  it("creates a Madar account with E-commerce on, connects and schedules the store, and emails the sign-in details", async () => {
    expect(await service.provision(install)).toBe("created")

    const deps = container.zidAutoProvisionDeps!
    const user = await deps.users.findByEmail("owner@store.test")
    expect(user).toMatchObject({ fullName: "Sara Ahmed" })
    expect(user?.emailVerifiedAt).toBeTruthy()
    const organization = await deps.organizations.findById(user!.primaryOrganizationId!)
    expect(organization).toMatchObject({ name: "متجر النخبة" })
    expect(organization?.settings.ecommerceEnabled).toBe(true)

    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user!.id, roles: ["owner"] }),
      "claim-token-1"
    )
    expect(scheduleSync).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "connection-1", userId: user!.id })
    )

    const [email] = sentEmails()
    expect(email).toMatchObject({
      email: "owner@store.test",
      storeName: "متجر النخبة",
      loginUrl: "https://app.madar.test/auth/basic/login",
      // The button signs this account straight in, opening the store's connection.
      signInUrl: `https://app.madar.test/login-link/for-${user!.id}-connection-1`,
    })
    // The emailed password actually signs in.
    expect(deps.hasher.verify(email.password, user!.passwordHash)).toBe(true)
  })

  it("links the store to an existing account by email, without a new password", async () => {
    const deps = container.zidAutoProvisionDeps!
    expect(await service.provision(install)).toBe("created")
    const owner = await deps.users.findByEmail("owner@store.test")
    const passwordHash = owner!.passwordHash

    expect(
      await service.provision({ ...install, claimToken: "claim-token-2", storeName: "Second" })
    ).toBe("linked")
    expect(claim).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: owner!.id, organizationId: owner!.primaryOrganizationId }),
      "claim-token-2"
    )
    expect((await deps.users.findByEmail("owner@store.test"))!.passwordHash).toBe(passwordHash)
    expect(sentEmails().at(-1)).toMatchObject({ storeName: "Second", password: "" })
  })

  it("leaves the install to be claimed from Madar when Salla gives no email", async () => {
    expect(await service.provision({ ...install, merchantEmail: null })).toBe("claim_required")
    expect(claim).not.toHaveBeenCalled()
    expect(sentEmails()).toHaveLength(0)
  })

  it("doesn't attach a store to an account whose member can't manage integrations", async () => {
    const deps = container.zidAutoProvisionDeps!
    await service.provision(install)
    const owner = await deps.users.findByEmail("owner@store.test")
    const membership = await deps.memberships.findFirstByUserId(owner!.id)
    await deps.memberships.save({ ...membership!, role: "viewer" })
    claim.mockClear()

    expect(await service.provision({ ...install, claimToken: "claim-token-3" })).toBe(
      "claim_required"
    )
    expect(claim).not.toHaveBeenCalled()
  })
})
