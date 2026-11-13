import { describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { bundleTrialSettingsPatch } from "../subscriptions/activation"
import { findBillingSettingsViolations } from "../subscriptions/billing-controlled-settings"
import { SUBSCRIPTION_APPLICATIONS } from "../subscriptions/types"
import type { RequestContext } from "../types"

const context: RequestContext = {
  requestId: "request-sub-1",
  correlationId: "correlation-sub-1",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  headers: {},
}

const PLATFORM_ADMIN_EMAIL = "staff@madar.test"

function createContainer() {
  return createIdentityPlatform({
    mode: "memory",
    config: {
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
      platformAdminEmails: [PLATFORM_ADMIN_EMAIL],
    },
  })
}

async function registerAndLogin(
  container: ReturnType<typeof createIdentityPlatform>,
  email: string
) {
  const registration = await container.commands.register(
    {
      email,
      password: "VeryStrongPassword123!",
      fullName: email,
      organizationName: `Org ${email}`,
      timezone: "UTC",
      language: "en",
    },
    context
  )

  await container.commands.verifyEmail({ token: registration.verificationToken }, context)

  const login = await container.commands.login(
    {
      email,
      password: "VeryStrongPassword123!",
    },
    context
  )

  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)
  return { registration, login, actor }
}

describe("subscription activation requests", () => {
  it("lets a customer submit a request and a platform admin approve it, flipping the organization's settings", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "activation-customer@madar.test")
    const staff = await registerAndLogin(container, PLATFORM_ADMIN_EMAIL)
    const organizationId = customer.actor.organizationId

    const request = await container.commands.requestApplicationActivation(
      customer.actor,
      organizationId,
      {
        application: "ecommerce",
        planTier: "growth",
        package: { id: "00000000-0000-4000-8000-000000000002", name: "Growth" },
        billingInterval: "monthly",
        priceHalalas: 29900,
        attachmentUrl: "https://storage.test/subscription-receipts/receipt.png",
        attachmentContentType: "image/png",
      },
      context
    )
    expect(request.status).toBe("pending")

    // Customer can see their own pending request.
    const mine = await container.queries.listMyOrganizationSubscriptionRequests(
      customer.actor,
      organizationId
    )
    expect(mine.map((entry) => entry.id)).toContain(request.id)

    // A non-platform-admin (even the organization's own owner) cannot approve/reject.
    await expect(
      container.commands.approveSubscriptionActivationRequest(customer.actor, request.id, context)
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" })
    await expect(
      container.queries.listSubscriptionActivationRequests(customer.actor)
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" })

    const approved = await container.commands.approveSubscriptionActivationRequest(
      staff.actor,
      request.id,
      context
    )
    expect(approved.status).toBe("approved")

    // A second review of the same request (another staff member, a double click) is a clean 409.
    await expect(
      container.commands.approveSubscriptionActivationRequest(staff.actor, request.id, context)
    ).rejects.toMatchObject({ code: "SUBSCRIPTION_REQUEST_ALREADY_REVIEWED", status: 409 })
    await expect(
      container.commands.rejectSubscriptionActivationRequest(
        staff.actor,
        request.id,
        { reason: "too late" },
        context
      )
    ).rejects.toMatchObject({ code: "SUBSCRIPTION_REQUEST_ALREADY_REVIEWED", status: 409 })

    const organization = await container.queries.getOrganization(customer.actor, organizationId)
    expect(organization.settings.ecommerceEnabled).toBe(true)
    expect(organization.settings.currentPlanTier).toBe("growth")
  })

  it("rejects a request with a reason and refuses a duplicate pending request for the same application", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "activation-customer-2@madar.test")
    const staff = await registerAndLogin(container, `second-${PLATFORM_ADMIN_EMAIL}`)
    // Only the configured allowlist email counts -- re-register it as platform admin for this test.
    const realStaff = await registerAndLogin(container, PLATFORM_ADMIN_EMAIL)
    const organizationId = customer.actor.organizationId

    const request = await container.commands.requestApplicationActivation(
      customer.actor,
      organizationId,
      {
        application: "advertising",
        planTier: "starter",
        package: { id: "00000000-0000-4000-8000-000000000001", name: "Starter" },
        billingInterval: "monthly",
        priceHalalas: 29900,
        attachmentUrl: "https://storage.test/subscription-receipts/receipt-2.png",
        attachmentContentType: "application/pdf",
      },
      context
    )

    // A second request for the same application while one is still pending is refused.
    await expect(
      container.commands.requestApplicationActivation(
        customer.actor,
        organizationId,
        {
          application: "advertising",
          planTier: "pro",
          package: { id: "00000000-0000-4000-8000-000000000003", name: "Pro" },
          billingInterval: "monthly",
          priceHalalas: 29900,
          attachmentUrl: "https://storage.test/subscription-receipts/receipt-3.png",
          attachmentContentType: "image/jpeg",
        },
        context
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })

    // staff.actor (not on the allowlist) cannot reject; realStaff.actor can.
    await expect(
      container.commands.rejectSubscriptionActivationRequest(
        staff.actor,
        request.id,
        { reason: "not allowed" },
        context
      )
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" })

    const rejected = await container.commands.rejectSubscriptionActivationRequest(
      realStaff.actor,
      request.id,
      { reason: "الإيصال غير واضح" },
      context
    )
    expect(rejected.status).toBe("rejected")
    expect(rejected.rejectionReason).toBe("الإيصال غير واضح")

    const organization = await container.queries.getOrganization(customer.actor, organizationId)
    expect(organization.settings.advertisingEnabled).not.toBe(true)
  })
})

describe("free application trials", () => {
  it("activates the application instantly, with no staff approval needed", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "trial-customer-1@madar.test")
    const organizationId = customer.actor.organizationId

    const result = await container.commands.startApplicationTrial(
      customer.actor,
      organizationId,
      { application: "pos" },
      context
    )
    expect(result.settings.posEnabled).toBe(true)
    expect(result.settings.posTrialUsed).toBe(true)
    expect(typeof result.settings.posTrialEndsAt).toBe("string")
    expect(new Date(result.settings.posTrialEndsAt as string).getTime()).toBeGreaterThan(Date.now())

    const organization = await container.queries.getOrganization(customer.actor, organizationId)
    expect(organization.settings.posEnabled).toBe(true)
  })

  it("refuses a second trial for the same application once the first has been used", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "trial-customer-2@madar.test")
    const organizationId = customer.actor.organizationId

    await container.commands.startApplicationTrial(
      customer.actor,
      organizationId,
      { application: "ecommerce" },
      context
    )

    await expect(
      container.commands.startApplicationTrial(
        customer.actor,
        organizationId,
        { application: "ecommerce" },
        context
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("refuses a trial for an application that's already active", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "trial-customer-3@madar.test")
    const staff = await registerAndLogin(container, PLATFORM_ADMIN_EMAIL)
    const organizationId = customer.actor.organizationId

    const request = await container.commands.requestApplicationActivation(
      customer.actor,
      organizationId,
      {
        application: "advertising",
        planTier: "starter",
        package: { id: "00000000-0000-4000-8000-000000000001", name: "Starter" },
        billingInterval: "monthly",
        priceHalalas: 29900,
        attachmentUrl: "https://storage.test/subscription-receipts/receipt-trial.png",
        attachmentContentType: "image/png",
      },
      context
    )
    await container.commands.approveSubscriptionActivationRequest(staff.actor, request.id, context)

    await expect(
      container.commands.startApplicationTrial(
        customer.actor,
        organizationId,
        { application: "advertising" },
        context
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("clears the trial's expiry marker once the same application is later approved for real", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "trial-customer-4@madar.test")
    const staff = await registerAndLogin(container, PLATFORM_ADMIN_EMAIL)
    const organizationId = customer.actor.organizationId

    await container.commands.startApplicationTrial(
      customer.actor,
      organizationId,
      { application: "madarApps" },
      context
    )

    const request = await container.commands.requestApplicationActivation(
      customer.actor,
      organizationId,
      {
        application: "madarApps",
        planTier: "pro",
        package: { id: "00000000-0000-4000-8000-000000000003", name: "Pro" },
        billingInterval: "monthly",
        priceHalalas: 29900,
        attachmentUrl: "https://storage.test/subscription-receipts/receipt-trial-upgrade.png",
        attachmentContentType: "image/png",
      },
      context
    )
    await container.commands.approveSubscriptionActivationRequest(staff.actor, request.id, context)

    const organization = await container.queries.getOrganization(customer.actor, organizationId)
    expect(organization.settings.madarAppsEnabled).toBe(true)
    expect(organization.settings.currentPlanTier).toBe("pro")
    expect(organization.settings.madarAppsTrialEndsAt).toBe("")
  })

  it("opens every application at once with a Madar Complete trial, once", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "trial-customer-5@madar.test")
    const organizationId = customer.actor.organizationId

    const result = await container.commands.startApplicationTrial(
      customer.actor,
      organizationId,
      { application: "madarComplete" },
      context
    )
    const endsAt = result.settings.posTrialEndsAt as string
    expect(new Date(endsAt).getTime()).toBeGreaterThan(Date.now())
    for (const application of SUBSCRIPTION_APPLICATIONS) {
      expect(result.settings[`${application}Enabled`]).toBe(true)
      expect(result.settings[`${application}TrialEndsAt`]).toBe(endsAt)
      expect(result.settings[`${application}TrialUsed`]).toBe(true)
    }
    expect(result.settings.madarCompleteTrialUsed).toBe(true)

    await expect(
      container.commands.startApplicationTrial(
        customer.actor,
        organizationId,
        { application: "madarComplete" },
        context
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("leaves a paid application alone when a Madar Complete trial starts", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "trial-customer-6@madar.test")
    const staff = await registerAndLogin(container, PLATFORM_ADMIN_EMAIL)
    const organizationId = customer.actor.organizationId

    const request = await container.commands.requestApplicationActivation(
      customer.actor,
      organizationId,
      {
        application: "advertising",
        planTier: "starter",
        package: { id: "00000000-0000-4000-8000-000000000001", name: "Starter" },
        billingInterval: "monthly",
        priceHalalas: 29900,
        attachmentUrl: "https://storage.test/subscription-receipts/receipt-bundle-trial.png",
        attachmentContentType: "image/png",
      },
      context
    )
    await container.commands.approveSubscriptionActivationRequest(staff.actor, request.id, context)

    const result = await container.commands.startApplicationTrial(
      customer.actor,
      organizationId,
      { application: "madarComplete" },
      context
    )
    // Still a paid application: no trial end date that would switch it off with the trial.
    expect(result.settings.advertisingEnabled).toBe(true)
    expect(result.settings.advertisingTrialEndsAt).toBe("")
    expect(typeof result.settings.posTrialEndsAt).toBe("string")
    expect(result.settings.posTrialEndsAt).not.toBe("")
  })

  it("never cuts an application's own longer trial short, and has nothing to offer a customer who has every application", () => {
    const bundleEnd = "2026-12-01T00:00:00.000Z"
    const longer = bundleTrialSettingsPatch(
      { posEnabled: true, posTrialEndsAt: "2026-12-10T00:00:00.000Z" },
      bundleEnd
    )
    expect(longer.opened).not.toContain("pos")
    expect(longer.patch.posTrialEndsAt).toBeUndefined()

    const shorter = bundleTrialSettingsPatch(
      { posEnabled: true, posTrialEndsAt: "2026-11-20T00:00:00.000Z" },
      bundleEnd
    )
    expect(shorter.patch.posTrialEndsAt).toBe(bundleEnd)

    const everything = Object.fromEntries(
      SUBSCRIPTION_APPLICATIONS.map((application) => [`${application}Enabled`, true])
    )
    expect(bundleTrialSettingsPatch(everything, bundleEnd).opened).toEqual([])
  })

  it("doesn't let a customer's own settings update reset the Madar Complete trial", () => {
    expect(findBillingSettingsViolations({ madarCompleteTrialUsed: false })).toHaveLength(1)
  })
})
